import json
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone


class QuizConsumer(AsyncWebsocketConsumer):
    """
    Real-time quiz battle consumer.

    URL: ws/quiz/<pin>/

    Message types (client → server):
      start_game     — host only: kicks off countdown then questions
      submit_answer  — player submits answer choice for current question
      kick_player    — host only: remove a player from lobby

    Message types (server → client):
      player_joined     — new player entered lobby
      player_left       — player disconnected
      game_countdown    — 3-2-1 before first question
      show_question     — broadcast question (no correct answer)
      timer_tick        — remaining seconds for current question
      round_result      — correct answer + per-player points earned this round
      leaderboard       — full sorted scores
      game_over         — final rankings + confetti trigger
      error             — something went wrong
    """

    async def connect(self):
        self.pin   = self.scope['url_route']['kwargs']['pin']
        self.group = f'quiz_{self.pin}'
        self.user  = self.scope['user']

        if self.user.is_anonymous:
            await self.close()
            return

        # Must be a player in this room
        room = await self._get_room()
        if not room:
            await self.close()
            return

        self.room_id = room.id

        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

        # Tell everyone a new player joined
        player = await self._get_or_create_player(room)
        players = await self._get_players()
        await self.channel_layer.group_send(self.group, {
            'type':    'player_joined',
            'players': players,
            'username': self.user.username,
        })

    async def disconnect(self, close_code):
        if not self.user.is_anonymous:
            players = await self._get_players()
            await self.channel_layer.group_send(self.group, {
                'type':     'player_left',
                'username': self.user.username,
                'players':  players,
            })
        await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        t    = data.get('type')

        if t == 'start_game':
            asyncio.create_task(self._handle_start_game())
        elif t == 'submit_answer':
            await self._handle_answer(data)
        elif t == 'kick_player':
            await self._handle_kick(data)

    # ── Game logic ────────────────────────────────────────────────────────────

    async def _handle_start_game(self):
        room = await self._get_room()
        if not room or room.host_id != self.user.id:
            await self.send_json({'type': 'error', 'msg': 'Only the host can start.'})
            return
        if room.status != 'lobby':
            return

        await self._set_status('countdown')

        # 3-2-1 countdown
        for i in (3, 2, 1):
            await self.channel_layer.group_send(self.group, {'type': 'game_countdown', 'count': i})
            await asyncio.sleep(1)

        await self._run_questions(room)

    async def _run_questions(self, room):
        questions = await self._get_questions()
        total     = len(questions)

        for idx, q in enumerate(questions):
            await self._set_q_idx(idx)
            await self._set_status('question')

            # Re-fetch room so time_per_q is always fresh
            room = await self._get_room()

            # Send question (no correct answer)
            await self.channel_layer.group_send(self.group, {
                'type':       'show_question',
                'idx':        idx,
                'total':      total,
                'id':         q['id'],
                'text':       q['text'],
                'opt_a':      q['opt_a'],
                'opt_b':      q['opt_b'],
                'opt_c':      q['opt_c'],
                'opt_d':      q['opt_d'],
                'time_limit': room.time_per_q,
            })

            # Countdown timer ticks
            for remaining in range(room.time_per_q, 0, -1):
                await asyncio.sleep(1)
                await self.channel_layer.group_send(self.group, {
                    'type':      'timer_tick',
                    'remaining': remaining - 1,
                })

            # Grace period — let last-second answers arrive before computing results
            await asyncio.sleep(1)

            # Show results for this round
            await self._set_status('results')
            results     = await self._calc_round_results(q['id'], q['correct'])
            leaderboard = await self._get_leaderboard()

            await self.channel_layer.group_send(self.group, {
                'type':        'round_result',
                'correct':     q['correct'],
                'results':     results,
                'leaderboard': leaderboard,
            })

            # Pause on round result screen before next question
            await asyncio.sleep(5)

        # Game over
        await self._set_status('finished')
        leaderboard = await self._get_leaderboard()
        await self.channel_layer.group_send(self.group, {
            'type':        'game_over',
            'leaderboard': leaderboard,
        })

    async def _handle_answer(self, data):
        choice    = data.get('choice', '').upper()
        time_taken = float(data.get('time_taken', 0))

        if choice not in ('A', 'B', 'C', 'D'):
            return

        room = await self._get_room()
        if not room or room.status != 'question':
            return

        questions = await self._get_questions()
        if room.current_q_idx >= len(questions):
            return

        q = questions[room.current_q_idx]
        await self._save_answer(q['id'], q['correct'], choice, time_taken, room.time_per_q)

    async def _handle_kick(self, data):
        room = await self._get_room()
        if not room or room.host_id != self.user.id:
            return
        username = data.get('username', '')
        await self._remove_player(username)
        players = await self._get_players()
        await self.channel_layer.group_send(self.group, {'type': 'player_left', 'username': username, 'players': players})

    # ── DB helpers ────────────────────────────────────────────────────────────

    @database_sync_to_async
    def _get_room(self):
        from .models import QuizRoom
        try:
            return QuizRoom.objects.select_related('host').get(pin=self.pin)
        except QuizRoom.DoesNotExist:
            return None

    @database_sync_to_async
    def _get_or_create_player(self, room):
        from .models import QuizPlayer
        player, _ = QuizPlayer.objects.get_or_create(room=room, user=self.user)
        return player

    @database_sync_to_async
    def _get_players(self):
        from .models import QuizPlayer
        players = QuizPlayer.objects.filter(room__pin=self.pin).select_related('user')
        return [{'username': p.user.username, 'score': p.score, 'streak': p.streak} for p in players]

    @database_sync_to_async
    def _get_questions(self):
        from .models import QuizQuestion
        return list(QuizQuestion.objects.filter(room__pin=self.pin).values(
            'id', 'order', 'text', 'opt_a', 'opt_b', 'opt_c', 'opt_d', 'correct'
        ))

    @database_sync_to_async
    def _set_status(self, s):
        from .models import QuizRoom
        QuizRoom.objects.filter(pin=self.pin).update(status=s)

    @database_sync_to_async
    def _set_q_idx(self, idx):
        from .models import QuizRoom
        QuizRoom.objects.filter(pin=self.pin).update(current_q_idx=idx)

    @database_sync_to_async
    def _save_answer(self, q_id, correct, choice, time_taken, time_limit):
        from .models import QuizPlayer, QuizQuestion, QuizAnswer
        from django.db.models import F
        try:
            player   = QuizPlayer.objects.get(room__pin=self.pin, user=self.user)
            question = QuizQuestion.objects.get(id=q_id)
        except Exception:
            return

        # Skip if already answered
        if QuizAnswer.objects.filter(player=player, question=question).exists():
            return

        is_correct = (choice == correct)

        if is_correct:
            # Speed bonus: 1000 pts max, scales down to 500 based on time taken
            speed_ratio = max(0.0, 1.0 - (time_taken / max(time_limit, 1)))
            points = int(500 + 500 * speed_ratio)
            # Streak bonus (+20% if 3+ in a row) — read streak FIRST then update
            current_streak = player.streak
            if current_streak >= 2:          # 3rd correct in a row
                points = int(points * 1.2)
            # Use F() to avoid race condition when multiple players answer simultaneously
            QuizPlayer.objects.filter(pk=player.pk).update(
                score=F('score') + points,
                streak=F('streak') + 1,
            )
        else:
            points = 0
            QuizPlayer.objects.filter(pk=player.pk).update(streak=0)

        QuizAnswer.objects.create(
            player=player, question=question,
            choice=choice, is_correct=is_correct,
            time_taken=time_taken, points=points,
        )

    @database_sync_to_async
    def _calc_round_results(self, q_id, correct):
        from .models import QuizAnswer
        answers = QuizAnswer.objects.filter(question_id=q_id).select_related('player__user')
        return [
            {
                'username':   a.player.user.username,
                'choice':     a.choice,
                'is_correct': a.is_correct,
                'points':     a.points,
                'time_taken': a.time_taken,
            }
            for a in answers
        ]

    @database_sync_to_async
    def _get_leaderboard(self):
        from .models import QuizPlayer
        players = QuizPlayer.objects.filter(room__pin=self.pin).select_related('user').order_by('-score')
        return [
            {'rank': i + 1, 'username': p.user.username, 'score': p.score, 'streak': p.streak}
            for i, p in enumerate(players)
        ]

    @database_sync_to_async
    def _remove_player(self, username):
        from .models import QuizPlayer
        QuizPlayer.objects.filter(room__pin=self.pin, user__username=username).delete()

    def send_json(self, data):
        import asyncio
        return self.send(text_data=json.dumps(data))

    # ── Channel layer event handlers (server → this client) ──────────────────

    async def player_joined(self, event):
        await self.send(text_data=json.dumps(event))

    async def player_left(self, event):
        await self.send(text_data=json.dumps(event))

    async def game_countdown(self, event):
        await self.send(text_data=json.dumps(event))

    async def show_question(self, event):
        await self.send(text_data=json.dumps(event))

    async def timer_tick(self, event):
        await self.send(text_data=json.dumps(event))

    async def round_result(self, event):
        await self.send(text_data=json.dumps(event))

    async def leaderboard(self, event):
        await self.send(text_data=json.dumps(event))

    async def game_over(self, event):
        await self.send(text_data=json.dumps(event))
