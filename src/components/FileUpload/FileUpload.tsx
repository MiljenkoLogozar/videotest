'use client';

import React, { useCallback, useState } from 'react';
import { Upload, AlertCircle, CheckCircle, X } from 'lucide-react';
import VideoSegmenter from '@/lib/ffmpeg/video-segmenter';
import type { VideoSegments } from '@/types';

interface FileUploadProps {
  onFileProcessed: (segments: VideoSegments, file: File) => void;
  onError: (error: string) => void;
  className?: string;
}

interface UploadStatus {
  file: File | null;
  status: 'idle' | 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onFileProcessed,
  onError,
  className = ''
}) => {
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({
    file: null,
    status: 'idle',
    progress: 0,
    message: ''
  });

  const [isDragOver, setIsDragOver] = useState(false);

  const processVideoFile = useCallback(async (file: File) => {
    // Validate file first
    const validation = VideoSegmenter.validateVideoFile(file);
    if (!validation.valid) {
      onError(validation.error || 'Invalid file');
      return;
    }

    // Check browser support
    if (!VideoSegmenter.isSupported()) {
      onError('Your browser does not support video processing. Please use Chrome 94+');
      return;
    }

    setUploadStatus({
      file,
      status: 'processing',
      progress: 0,
      message: 'Initializing video processor...'
    });

    try {
      const segmenter = new VideoSegmenter();
      
      const segments = await segmenter.segmentVideo(file, (progress) => {
        console.log('Processing progress:', progress);
        setUploadStatus(prev => ({
          ...prev,
          progress,
          message: progress < 30 
            ? 'Segmenting video...' 
            : progress < 60 
            ? 'Processing segments...' 
            : progress < 80
            ? 'Generating thumbnails...'
            : 'Finalizing...'
        }));
      });

      setUploadStatus(prev => ({
        ...prev,
        status: 'completed',
        progress: 100,
        message: 'Video processed successfully!'
      }));

      onFileProcessed(segments, file);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process video';
      setUploadStatus(prev => ({
        ...prev,
        status: 'error',
        message: errorMessage
      }));
      onError(errorMessage);
    }
  }, [onFileProcessed, onError]);

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    processVideoFile(file);
  }, [processVideoFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
  }, [handleFileSelect]);

  const resetUpload = useCallback(() => {
    setUploadStatus({
      file: null,
      status: 'idle',
      progress: 0,
      message: ''
    });
  }, []);

  const formatFileSize = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getStatusIcon = () => {
    switch (uploadStatus.status) {
      case 'processing':
        return (
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        );
      case 'completed':
        return <CheckCircle className="h-8 w-8 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-8 w-8 text-red-600" />;
      default:
        return <Upload className="h-8 w-8 text-gray-400" />;
    }
  };

  const getStatusColor = () => {
    switch (uploadStatus.status) {
      case 'processing':
        return 'border-blue-300 bg-blue-50';
      case 'completed':
        return 'border-green-300 bg-green-50';
      case 'error':
        return 'border-red-300 bg-red-50';
      default:
        return isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-white';
    }
  };

  return (
    <div className={`w-full ${className}`}>
      <div
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200
          ${getStatusColor()}
          ${uploadStatus.status === 'idle' ? 'hover:border-blue-400 hover:bg-blue-50 cursor-pointer' : ''}
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => {
          if (uploadStatus.status === 'idle') {
            document.getElementById('file-input')?.click();
          }
        }}
      >
        {/* Hidden file input */}
        <input
          id="file-input"
          type="file"
          accept="video/mp4,video/quicktime,video/x-msvideo"
          onChange={handleFileInputChange}
          className="hidden"
          disabled={uploadStatus.status !== 'idle'}
        />

        {/* Status icon */}
        <div className="flex justify-center mb-4">
          {getStatusIcon()}
        </div>

        {/* Content based on status */}
        {uploadStatus.status === 'idle' && (
          <>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {isDragOver ? 'Drop your video here' : 'Upload Video File'}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Drag and drop or click to select an MP4 video file
            </p>
            <p className="text-xs text-gray-500">
              Maximum file size: 3GB • Supported formats: MP4 H.264
            </p>
          </>
        )}

        {uploadStatus.status === 'processing' && uploadStatus.file && (
          <>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Processing Video
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {uploadStatus.file.name} ({formatFileSize(uploadStatus.file.size)})
            </p>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadStatus.progress}%` }}
              />
            </div>
            <p className="text-sm text-blue-600">
              {uploadStatus.message} ({uploadStatus.progress}%)
            </p>
          </>
        )}

        {uploadStatus.status === 'completed' && uploadStatus.file && (
          <>
            <h3 className="text-lg font-medium text-green-900 mb-2">
              Video Processed Successfully!
            </h3>
            <p className="text-sm text-green-700 mb-4">
              {uploadStatus.file.name} is ready for editing
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                resetUpload();
              }}
              className="inline-flex items-center px-3 py-2 border border-green-300 shadow-sm text-sm leading-4 font-medium rounded-md text-green-700 bg-white hover:bg-green-50"
            >
              Upload Another Video
            </button>
          </>
        )}

        {uploadStatus.status === 'error' && (
          <>
            <h3 className="text-lg font-medium text-red-900 mb-2">
              Processing Failed
            </h3>
            <p className="text-sm text-red-700 mb-4">
              {uploadStatus.message}
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                resetUpload();
              }}
              className="inline-flex items-center px-3 py-2 border border-red-300 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 bg-white hover:bg-red-50"
            >
              Try Again
            </button>
          </>
        )}

        {/* Close button for completed/error states */}
        {(uploadStatus.status === 'completed' || uploadStatus.status === 'error') && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              resetUpload();
            }}
            className="absolute top-2 right-2 p-1 rounded-full hover:bg-gray-200"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        )}
      </div>

      {/* Browser support warning */}
      {!VideoSegmenter.isSupported() && (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-yellow-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Browser Not Supported
              </h3>
              <p className="mt-2 text-sm text-yellow-700">
                This video editor requires Chrome 94+ with WebCodecs support. 
                Please update your browser to use this feature.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUpload;