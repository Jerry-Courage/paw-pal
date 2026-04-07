from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from .models import StudyGroup, GroupMembership, GroupSession, GroupTask, GroupMessage
from .serializers import (
    StudyGroupSerializer, GroupSessionSerializer,
    GroupTaskSerializer, GroupMessageSerializer
)
from ai_assistant.services import AIService


class GroupListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = StudyGroupSerializer

    def get_queryset(self):
        filter_type = self.request.query_params.get('filter', 'my')
        if filter_type == 'all':
            return StudyGroup.objects.filter(is_public=True).select_related('owner').prefetch_related('memberships')
        return StudyGroup.objects.filter(memberships__user=self.request.user).select_related('owner').prefetch_related('memberships')

    def perform_create(self, serializer):
        group = serializer.save(owner=self.request.user)
        GroupMembership.objects.create(user=self.request.user, group=group, role='admin')

    def get_serializer_context(self):
        return {'request': self.request}


class GroupDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = StudyGroupSerializer

    def get_queryset(self):
        return StudyGroup.objects.all()

    def get_serializer_context(self):
        return {'request': self.request}


class JoinLeaveGroupView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        group = get_object_or_404(StudyGroup, pk=pk)
        membership, created = GroupMembership.objects.get_or_create(user=request.user, group=group)
        if created:
            return Response({'detail': 'Joined group.'}, status=status.HTTP_201_CREATED)
        return Response({'detail': 'Already a member.'})

    def delete(self, request, pk):
        group = get_object_or_404(StudyGroup, pk=pk)
        GroupMembership.objects.filter(user=request.user, group=group).delete()
        return Response({'detail': 'Left group.'}, status=status.HTTP_204_NO_CONTENT)


class GroupSessionListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = GroupSessionSerializer

    def get_queryset(self):
        group_id = self.kwargs['group_id']
        return GroupSession.objects.filter(group_id=group_id)

    def perform_create(self, serializer):
        group = get_object_or_404(StudyGroup, pk=self.kwargs['group_id'])
        serializer.save(group=group)


class GroupTaskView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = GroupTaskSerializer

    def get_queryset(self):
        return GroupTask.objects.filter(group_id=self.kwargs['group_id'])

    def perform_create(self, serializer):
        group = get_object_or_404(StudyGroup, pk=self.kwargs['group_id'])
        serializer.save(group=group)


class GroupTaskDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = GroupTaskSerializer

    def get_queryset(self):
        return GroupTask.objects.filter(group_id=self.kwargs['group_id'])


class GroupMessageView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = GroupMessageSerializer

    def get_queryset(self):
        return GroupMessage.objects.filter(group_id=self.kwargs['group_id'])

    def perform_create(self, serializer):
        group = get_object_or_404(StudyGroup, pk=self.kwargs['group_id'])
        msg = serializer.save(group=group, sender=self.request.user)

        # Auto AI response if message mentions @FlowAI
        if '@FlowAI' in msg.content or '@flowai' in msg.content.lower():
            ai = AIService()
            try:
                reply = ai.group_chat_assist(group.name, '', msg.content)
                GroupMessage.objects.create(group=group, sender=self.request.user, content=reply, is_ai=True)
            except Exception:
                pass

    def get_serializer_context(self):
        return {'request': self.request}
