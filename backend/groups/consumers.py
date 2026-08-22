import json
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone


class QuizConsumer(AsyncWebsocketConsumer):
    """
    Real-time quiz battle consumer — redesigned v2.

    Client → Server message types:
      start_game      — host only: kicks off countdown then questions
      submit_answer   — player submits answer choice for current question
      kick_player     — host only: remove a player from lobby
      set_ready       — player toggles ready state in lobby
      send_reaction   — emoji reaction during question/round_result
      request_rematch — any player: request rematch (resets room to lobby)
      chat_message    — in-game chat message

    Server → Client message types:
      player_joined     — new player entered lobby
      player_left       — player disconnected
      player_ready      — ready state changed
      game_countdown    — 3-2-1 before first question
      show_question     — broadcast question with explanation
      timer_tick        — remaining seconds for current question
      answer_reaction   — someone sent an emoji reaction
      round_result      — correct answer + per-player points + explanation
      leaderboard       — full sorted scores
      game_over         — final rankings + XP + battle history
      chat_message      — in-game chat
      rematch_request   — someone requested rematch
      rematch_start     — rematch begins (room reset to lobby)
      error             — something went wrong
    """

    async def connect(self):
        self.pin   = self.scope['url_route']['kwargs']['pin']
        self.group = f'quiz_{self.pin}'
        self.user  = self.scope['user']

        if self.user.is_anonymous:
            await self.close()
            return

        room = await self._get_room()
        if not room:
            await self.close()
            return

        self.room_id = room.id
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

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
        elif t == 'set_ready':
            await self._handle_ready()
        elif t == 'send_reaction':
            await self._handle_reaction(data)
        elif t == 'request_rematch':
            await self._handle_rematch()
        elif t == 'chat_message':
            await self._handle_chat(data)

    # ── Game logic ────────────────────────────────────────────────────────────

    async def _handle_start_game(self):
        room = await self._get_room()
        if not room or room.host_id != self.user.id:
            await self.send_json({'type': 'error', 'msg': 'Only the host can start.'})
            return
        if room.status != 'lobby':
            return

        await self._set_status('countdown')

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
            room = await self._get_room()

            await self.channel_layer.group_send(self.group, {
                'type':        'show_question',
                'idx':         idx,
                'total':       total,
                'id':          q['id'],
                'text':        q['text'],
                'opt_a':       q['opt_a'],
                'opt_b':       q['opt_b'],
                'opt_c':       q['opt_c'],
                'opt_d':       q['opt_d'],
                'time_limit':  room.time_per_q,
            })

            for remaining in range(room.time_per_q, 0, -1):
                await asyncio.sleep(1)
                await self.channel_layer.group_send(self.group, {
                    'type':      'timer_tick',
                    'remaining': remaining - 1,
                })

            await asyncio.sleep(1)
            await self._set_status('results')
            results     = await self._calc_round_results(q['id'], q['correct'])
            leaderboard = await self._get_leaderboard()

            await self.channel_layer.group_send(self.group, {
                'type':        'round_result',
                'correct':     q['correct'],
                'explanation': q.get('explanation', ''),
                'results':     results,
                'leaderboard': leaderboard,
            })

            await asyncio.sleep(5)

        await self._set_status('finished')
        leaderboard = await self._get_leaderboard()

        xp_awards = []
        XP_REWARDS = {1: 15, 2: 10, 3: 5}
        for entry in leaderboard:
            rank = entry['rank']
            if rank in XP_REWARDS:
                await self._award_quiz_xp(entry['username'], XP_REWARDS[rank])
                xp_awards.append({'username': entry['username'], 'xp': XP_REWARDS[rank], 'rank': rank})
            else:
                await self._award_quiz_xp(entry['username'], 1)
                xp_awards.append({'username': entry['username'], 'xp': 1, 'rank': rank})

        perfect_users = await self._check_perfect_scores()
        for u in perfect_users:
            await self._award_quiz_xp(u, 5)
            xp_awards.append({'username': u, 'xp': 5, 'rank': 0, 'bonus': 'perfect_score'})

        if leaderboard:
            await self._update_battle_streaks(leaderboard)
            await self._save_battle_history(leaderboard, total, xp_awards)

        await self.channel_layer.group_send(self.group, {
            'type':        'game_over',
            'leaderboard': leaderboard,
            'xp_awards':   xp_awards,
        })

    async def _handle_answer(self, data):
        choice     = data.get('choice', '').upper()
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

        answered_count = await self._get_answered_count(q['id'])
        player_count   = await self._get_player_count()
        await self.channel_layer.group_send(self.group, {
            'type':          'answer_reaction',
            'reaction_type': 'answer_submit',
            'username':      self.user.username,
            'answered':      answered_count,
            'total':         player_count,
        })

    async def _handle_ready(self):
        room = await self._get_room()
        if not room or room.status != 'lobby':
            return
        await self._toggle_ready()
        players = await self._get_players()
        await self.channel_layer.group_send(self.group, {
            'type':    'player_ready',
            'players': players,
            'username': self.user.username,
        })

    async def _handle_reaction(self, data):
        emoji = data.get('emoji', '')
        if not emoji or len(emoji) > 8:
            return
        await self.channel_layer.group_send(self.group, {
            'type':     'answer_reaction',
            'reaction_type': 'emoji',
            'username': self.user.username,
            'emoji':    emoji,
        })

    async def _handle_chat(self, data):
        msg = data.get('message', '').strip()
        if not msg or len(msg) > 200:
            return
        await self.channel_layer.group_send(self.group, {
            'type':     'chat_message',
            'username': self.user.username,
            'message':  msg,
        })

    async def _handle_rematch(self):
        room = await self._get_room()
        if not room:
            return

        await self._toggle_rematch_ready()

        all_ready = await self._check_all_rematch()
        if all_ready:
            await self._reset_room_for_rematch()
            players = await self._get_players()
            await self.channel_layer.group_send(self.group, {
                'type':    'rematch_start',
                'players': players,
            })
        else:
            await self.channel_layer.group_send(self.group, {
                'type':     'rematch_request',
                'username': self.user.username,
            })

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
        return [{
            'username': p.user.username,
            'score':    p.score,
            'streak':   p.streak,
            'ready':    p.ready,
            'correct_count': p.correct_count,
            'best_streak': max(p.streak, 0),
        } for p in players]

    @database_sync_to_async
    def _get_questions(self):
        from .models import QuizQuestion
        return list(QuizQuestion.objects.filter(room__pin=self.pin).values(
            'id', 'order', 'text', 'opt_a', 'opt_b', 'opt_c', 'opt_d', 'correct', 'explanation'
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

        if QuizAnswer.objects.filter(player=player, question=question).exists():
            return

        is_correct = (choice == correct)

        if is_correct:
            speed_ratio = max(0.0, 1.0 - (time_taken / max(time_limit, 1)))
            points = int(500 + 500 * speed_ratio)
            current_streak = player.streak
            if current_streak >= 2:
                points = int(points * 1.2)
            QuizPlayer.objects.filter(pk=player.pk).update(
                score=F('score') + points,
                streak=F('streak') + 1,
                correct_count=F('correct_count') + 1,
                total_time=F('total_time') + time_taken,
            )
        else:
            points = 0
            QuizPlayer.objects.filter(pk=player.pk).update(streak=0, total_time=F('total_time') + time_taken)

        QuizAnswer.objects.create(
            player=player, question=question,
            choice=choice, is_correct=is_correct,
            time_taken=time_taken, points=points,
        )

    @database_sync_to_async
    def _get_answered_count(self, q_id):
        from .models import QuizAnswer
        return QuizAnswer.objects.filter(question_id=q_id).count()

    @database_sync_to_async
    def _get_player_count(self):
        from .models import QuizPlayer
        return QuizPlayer.objects.filter(room__pin=self.pin).count()

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
                'time_taken': round(a.time_taken, 2),
            }
            for a in answers
        ]

    @database_sync_to_async
    def _get_leaderboard(self):
        from .models import QuizPlayer
        players = QuizPlayer.objects.filter(room__pin=self.pin).select_related('user').order_by('-score')
        return [
            {
                'rank':          i + 1,
                'username':      p.user.username,
                'score':         p.score,
                'streak':        p.streak,
                'correct_count': p.correct_count,
                'total_time':    round(p.total_time, 1),
                'avg_time':      round(p.total_time / max(p.correct_count, 1), 1),
            }
            for i, p in enumerate(players)
        ]

    @database_sync_to_async
    def _remove_player(self, username):
        from .models import QuizPlayer
        QuizPlayer.objects.filter(room__pin=self.pin, user__username=username).delete()

    @database_sync_to_async
    def _toggle_ready(self):
        from .models import QuizPlayer
        try:
            player = QuizPlayer.objects.get(room__pin=self.pin, user=self.user)
            player.ready = not player.ready
            player.save(update_fields=['ready'])
        except QuizPlayer.DoesNotExist:
            pass

    @database_sync_to_async
    def _toggle_rematch_ready(self):
        from .models import QuizPlayer
        try:
            player = QuizPlayer.objects.get(room__pin=self.pin, user=self.user)
            player.ready = not player.ready
            player.save(update_fields=['ready'])
        except QuizPlayer.DoesNotExist:
            pass

    @database_sync_to_async
    def _check_all_rematch(self):
        from .models import QuizPlayer
        players = list(QuizPlayer.objects.filter(room__pin=self.pin))
        return len(players) > 1 and all(p.ready for p in players)

    @database_sync_to_async
    def _reset_room_for_rematch(self):
        from .models import QuizRoom, QuizPlayer, QuizAnswer
        QuizAnswer.objects.filter(player__room__pin=self.pin).delete()
        QuizPlayer.objects.filter(room__pin=self.pin).update(score=0, streak=0, ready=False, correct_count=0, total_time=0)
        QuizRoom.objects.filter(pin=self.pin).update(status='lobby', current_q_idx=0)

    @database_sync_to_async
    def _award_quiz_xp(self, username, amount):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return
        obs = user.onboarding_status or {}
        current = int(obs.get('quiz_xp', 0))
        obs['quiz_xp'] = current + amount
        user.onboarding_status = obs
        user.save(update_fields=['onboarding_status'])

    @database_sync_to_async
    def _check_perfect_scores(self):
        from .models import QuizPlayer, QuizAnswer
        players = QuizPlayer.objects.filter(room__pin=self.pin)
        perfect = []
        for p in players:
            total = QuizAnswer.objects.filter(player=p).count()
            correct = QuizAnswer.objects.filter(player=p, is_correct=True).count()
            if total > 0 and correct == total:
                perfect.append(p.user.username)
        return perfect

    @database_sync_to_async
    def _update_battle_streaks(self, leaderboard):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        if not leaderboard:
            return
        winner_name = leaderboard[0]['username']
        try:
            winner = User.objects.get(username=winner_name)
        except User.DoesNotExist:
            return
        obs = winner.onboarding_status or {}
        current_streak = int(obs.get('battle_streak', 0))
        obs['battle_streak'] = current_streak + 1
        obs['best_battle_streak'] = max(int(obs.get('best_battle_streak', 0)), obs['battle_streak'])
        winner.onboarding_status = obs
        winner.save(update_fields=['onboarding_status'])
        for entry in leaderboard[1:]:
            try:
                loser = User.objects.get(username=entry['username'])
                lobs = loser.onboarding_status or {}
                lobs['battle_streak'] = 0
                loser.onboarding_status = lobs
                loser.save(update_fields=['onboarding_status'])
            except User.DoesNotExist:
                pass

    @database_sync_to_async
    def _save_battle_history(self, leaderboard, total_questions, xp_awards):
        from .models import BattleHistory
        from .models import QuizRoom
        try:
            room = QuizRoom.objects.get(pin=self.pin)
        except QuizRoom.DoesNotExist:
            return
        from django.contrib.auth import get_user_model
        User = get_user_model()
        xp_map = {a['username']: a for a in xp_awards}
        for entry in leaderboard:
            try:
                user = User.objects.get(username=entry['username'])
            except User.DoesNotExist:
                continue
            award = xp_map.get(entry['username'], {})
            BattleHistory.objects.create(
                room=room,
                player=user,
                score=entry['score'],
                rank=entry['rank'],
                correct_count=entry['correct_count'],
                total_questions=total_questions,
                best_streak=entry.get('best_streak', 0),
                avg_time=entry.get('avg_time', 0),
                xp_earned=award.get('xp', 1),
            )

    def send_json(self, data):
        return self.send(text_data=json.dumps(data))

    # ── Channel layer event handlers ──────────────────────────────────────────

    async def player_joined(self, event):
        await self.send(text_data=json.dumps(event))

    async def player_left(self, event):
        await self.send(text_data=json.dumps(event))

    async def player_ready(self, event):
        await self.send(text_data=json.dumps(event))

    async def game_countdown(self, event):
        await self.send(text_data=json.dumps(event))

    async def show_question(self, event):
        await self.send(text_data=json.dumps(event))

    async def timer_tick(self, event):
        await self.send(text_data=json.dumps(event))

    async def answer_reaction(self, event):
        await self.send(text_data=json.dumps(event))

    async def round_result(self, event):
        await self.send(text_data=json.dumps(event))

    async def leaderboard(self, event):
        await self.send(text_data=json.dumps(event))

    async def game_over(self, event):
        await self.send(text_data=json.dumps(event))

    async def chat_message(self, event):
        await self.send(text_data=json.dumps(event))

    async def rematch_request(self, event):
        await self.send(text_data=json.dumps(event))

    async def rematch_start(self, event):
        await self.send(text_data=json.dumps(event))
