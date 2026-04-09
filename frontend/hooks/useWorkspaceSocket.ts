import { useEffect, useRef, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

interface SocketMessage {
  type: string
  [key: string]: any
}

export function useWorkspaceSocket(workspaceId: number) {
  const { data: session } = useSession()
  const qc = useQueryClient()
  const socketRef = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [activeUsers, setActiveUsers] = useState<any[]>([])
  const [userFocus, setUserFocus] = useState<Record<number, number | null>>({})
  const [lockedBlocks, setLockedBlocks] = useState<Record<number, { userId: number, userName: string }>>({})
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const connect = useCallback(() => {
    if (!session?.accessToken || socketRef.current) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = process.env.NEXT_PUBLIC_API_URL?.replace('http://', '').replace('https://', '') || 'localhost:8000'
    const socketUrl = `${protocol}//${host}/ws/workspace/${workspaceId}/?token=${session.accessToken}`

    const ws = new WebSocket(socketUrl)

    ws.onopen = () => {
      console.log('Workspace WebSocket Connected')
      setIsConnected(true)
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }

    ws.onmessage = (event) => {
      const data: SocketMessage = JSON.parse(event.data)
      handleSocketMessage(data)
    }

    ws.onclose = () => {
      console.log('Workspace WebSocket Disconnected')
      setIsConnected(false)
      socketRef.current = null
      // Attempt to reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(connect, 3000)
    }

    ws.onerror = (err) => {
      console.error('Workspace WebSocket Error:', err)
      ws.close()
    }

    socketRef.current = ws
  }, [session?.accessToken, workspaceId])

  const handleSocketMessage = useCallback((data: SocketMessage) => {
    switch (data.type) {
      case 'block_created':
        qc.setQueryData(['workspace-blocks', workspaceId], (old: any) => {
          if (!old) return [data.block]
          // Avoid duplicates if the message was already added by the sender's own UI
          if (old.find((b: any) => b.id === data.block.id)) return old
          return [...old, data.block].sort((a: any, b: any) => a.order - b.order)
        })
        break

      case 'block_updated':
        qc.setQueryData(['workspace-blocks', workspaceId], (old: any) => {
          if (!old) return old
          return old.map((b: any) => b.id === data.block.id ? data.block : b)
        })
        break

      case 'block_deleted':
        qc.setQueryData(['workspace-blocks', workspaceId], (old: any) => {
          if (!old) return old
          return old.filter((b: any) => b.id !== data.block_id)
        })
        break

      case 'broadcast_block_update':
        qc.setQueryData(['workspace-blocks', workspaceId], (old: any) => {
          if (!old) return old
          return old.map((b: any) => 
            b.id === data.block_id ? { ...b, content: data.content } : b
          )
        })
        break

      case 'broadcast_chat_message':
        qc.setQueryData(['workspace-messages', workspaceId], (old: any) => {
          const newMsg = {
            id: data.id || Date.now(),
            content: data.content,
            author_name: data.author_name,
            author_id: data.author_id,
            is_ai: data.is_ai,
            created_at: data.created_at || new Date().toISOString(),
          }
          if (!old) return [newMsg]
          if (old.find((m: any) => m.content === newMsg.content && Math.abs(new Date(m.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 2000)) return old
          return [...old, newMsg]
        })
        if (data.is_ai) {
          toast.success("FlowAI responded", { icon: '🤖' })
        }
        break

      case 'broadcast_presence_focus':
        setUserFocus(prev => ({
          ...prev,
          [data.user_id]: data.block_id
        }))
        break

      case 'broadcast_block_lock':
        setLockedBlocks(prev => ({
          ...prev,
          [data.block_id]: { userId: data.user_id, userName: data.user_name }
        }))
        break

      case 'broadcast_block_unlock':
        setLockedBlocks(prev => {
          const newState = { ...prev }
          delete newState[data.block_id]
          return newState
        })
        break
      
      case 'presence_update':
        if (data.status === 'online') {
          setActiveUsers(prev => {
            if (prev.find(u => u.id === data.user_id)) return prev
            return [...prev, { id: data.user_id, name: data.user_name }]
          })
          toast.success(`${data.user_name} joined the workspace`, { duration: 2000 })
        } else if (data.status === 'offline') {
          setActiveUsers(prev => prev.filter(u => u.id !== data.user_id))
        }
        break
    }
  }, [qc, workspaceId])

  const sendMessage = useCallback((message: SocketMessage) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message))
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (socketRef.current) {
        socketRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [connect])

  return { isConnected, sendMessage, activeUsers, userFocus, lockedBlocks }
}
