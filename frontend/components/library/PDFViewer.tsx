'use client'

import { useState, useCallback, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { useMeasure } from 'react-use'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, AlertCircle } from 'lucide-react'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Use local worker from public folder (avoids CDN issues)
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

interface Props {
  fileUrl: string
  title?: string
}

export default function PDFViewer({ fileUrl, title }: Props) {
  const [containerRef, { width: containerWidth }] = useMeasure<HTMLDivElement>()
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.0)
  const [error, setError] = useState<string | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  // Fetch as ArrayBuffer / Base64 to bypass Download Manager interceptors (IDM, etc.)
  useEffect(() => {
    let currentBlobUrl: string | null = null
    
    const fetchFileData = async () => {
      if (!fileUrl) return
      
      try {
        const res = await fetch(fileUrl)
        if (!res.ok) {
          throw new Error(`Failed to fetch PDF: ${res.status} ${res.statusText}`)
        }
        
        // v6 "Nuclear Option": Parse JSON and decode Base64
        const json = await res.json()
        if (!json.data) throw new Error('No data field in JSON response')
        
        // Convert base64 to Uint8Array
        const binaryString = window.atob(json.data)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        
        // v6.1 Stabilization: Convert to Blob URL
        const blob = new Blob([bytes], { type: 'application/pdf' })
        currentBlobUrl = URL.createObjectURL(blob)
        setBlobUrl(currentBlobUrl)
        setError(null)
      } catch (err: any) {
        console.error('PDF Fetch Error:', err)
        setError(err.message || 'Failed to fetch PDF data')
      }
    }

    fetchFileData()

    // Cleanup to prevent memory leaks
    return () => {
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl)
      }
    }
  }, [fileUrl])

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setError(null)
  }, [])

  const onDocumentLoadError = useCallback((err: Error) => {
    console.error('PDF load error:', err)
    setError(err.message || 'Failed to load PDF')
  }, [])

  const zoomIn = () => setScale((s) => Math.min(s + 0.25, 2.5))
  const zoomOut = () => setScale((s) => Math.max(s - 0.25, 0.5))

  if (!fileUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
        <AlertCircle className="w-10 h-10 mb-3 opacity-50" />
        <p className="text-sm">No file URL available</p>
      </div>
    )
  }

  const effectiveWidth = Math.max((containerWidth || 300) - 32, 200) * scale

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="flex items-center gap-1 sm:gap-2 text-sm text-gray-500 dark:text-gray-400">
          <button onClick={zoomOut} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="w-10 sm:w-12 text-center font-bold tabular-nums text-[10px] sm:text-xs text-primary">{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 hidden sm:block" />
        <button onClick={() => window.open(fileUrl, '_blank')} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400" title="Open original">
          <Maximize2 className="w-4 h-4" />
        </button>
        {title && (
          <span className="ml-auto text-[10px] text-gray-400 truncate max-w-[120px] sm:max-w-[200px] font-medium uppercase tracking-wider">{title}</span>
        )}
      </div>

      {/* PDF content */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-950 flex flex-col items-center py-4 px-2 sm:px-4 text-slate-800">
        {error ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 px-6 text-center">
            <AlertCircle className="w-10 h-10 mb-3 text-red-400" />
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Could not load PDF</p>
            <p className="text-xs text-gray-400 mb-4">{error}</p>
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-slate-700 text-white rounded-xl text-xs hover:bg-slate-600 transition-colors"
            >
              Open file directly ↗
            </a>
          </div>
        ) : (
          <Document
            file={blobUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm">Loading PDF...</p>
              </div>
            }
          >
            <div className="mb-3 shadow-2xl rounded-sm overflow-hidden border border-gray-200 dark:border-white/10">
              <Page
                pageNumber={pageNumber}
                width={effectiveWidth}
                renderTextLayer
                renderAnnotationLayer
                className="block"
              />
            </div>
          </Document>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-center gap-4 py-3 pb-20 sm:pb-3 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <button
          onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
          disabled={pageNumber <= 1}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 text-sm">
          <input
            type="number"
            value={pageNumber}
            min={1}
            max={numPages || 1}
            onChange={(e) => {
              const val = Math.min(numPages, Math.max(1, Number(e.target.value)))
              if (!isNaN(val)) setPageNumber(val)
            }}
            className="w-12 text-center border border-gray-200 dark:border-gray-700 rounded-lg py-1 text-sm bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <span className="text-gray-400">/ {numPages || '?'}</span>
        </div>
        <button
          onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
          disabled={pageNumber >= numPages}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
