'use client'

import React from 'react'
import { AlertCircle } from 'lucide-react'

interface Props {
  fileUrl?: string
  children: React.ReactNode
}

interface State {
  hasError: boolean
  errorMsg: string
}

export default class PDFViewerErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, errorMsg: '' }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMsg: error.message || 'PDF rendering failed' }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[PDFViewerErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      const { fileUrl } = this.props
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6 text-center">
          <AlertCircle className="w-10 h-10 mb-3 text-red-400" />
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
            Could not display PDF preview
          </p>
          <p className="text-xs text-gray-400 mb-4">{this.state.errorMsg}</p>
          {fileUrl && (
            <a
              href={fileUrl.includes('?') ? `${fileUrl}&raw=1` : `${fileUrl}?raw=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-slate-700 text-white rounded-xl text-xs hover:bg-slate-600 transition-colors"
            >
              Open file directly
            </a>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
