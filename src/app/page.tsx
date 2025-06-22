'use client';

import React, { useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Settings, Upload as UploadIcon } from 'lucide-react';
import FileUpload from '@/components/FileUpload/FileUpload';
import { useVideoEditorStore, useCurrentProject, useTimeline, useTimelineActions, useProjectActions } from '@/lib/stores/video-editor-store';
import type { VideoSegments } from '@/types';

export default function VideoEditorPage() {
  const currentProject = useCurrentProject();
  const timeline = useTimeline();
  const { play, pause, seek, setCurrentTime } = useTimelineActions();
  const { createProject } = useProjectActions();
  
  const [showUpload, setShowUpload] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create a default project on mount
  useEffect(() => {
    if (!currentProject) {
      createProject('My Video Project');
    }
  }, [currentProject, createProject]);

  const handleFileProcessed = (segments: VideoSegments, file: File) => {
    console.log('Video processed:', {
      segments: segments.segments.length,
      thumbnails: segments.thumbnails.length,
      metadata: segments.metadata,
      waveform: segments.waveform.length
    });
    
    setShowUpload(false);
    setError(null);
    
    // TODO: Add the video to the timeline
    // This will be implemented when we create the timeline component
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    console.error('Video processing error:', errorMessage);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold">Video Editor</h1>
            {currentProject && (
              <span className="text-gray-400">• {currentProject.title}</span>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
            >
              <UploadIcon className="h-4 w-4" />
              <span>Upload Video</span>
            </button>
            <button className="p-2 hover:bg-gray-700 rounded-md transition-colors">
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Video Preview Area */}
          <div className="flex-1 bg-black relative">
            {showUpload ? (
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <div className="w-full max-w-2xl">
                  <FileUpload
                    onFileProcessed={handleFileProcessed}
                    onError={handleError}
                  />
                  {error && (
                    <div className="mt-4 p-4 bg-red-900 border border-red-700 rounded-md">
                      <p className="text-red-100">{error}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-96 h-54 bg-gray-800 rounded-lg flex items-center justify-center mb-4">
                    <Play className="h-16 w-16 text-gray-600" />
                  </div>
                  <p className="text-gray-400">Video Preview Area</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Video player will be implemented in Phase 2
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Transport Controls */}
          <div className="bg-gray-800 border-t border-gray-700 px-6 py-4">
            <div className="flex items-center justify-center space-x-4">
              <button
                onClick={() => seek(0)}
                className="p-2 hover:bg-gray-700 rounded-md transition-colors"
                disabled={!currentProject}
              >
                <SkipBack className="h-5 w-5" />
              </button>
              
              <button
                onClick={() => timeline.isPlaying ? pause() : play()}
                className="p-3 bg-blue-600 hover:bg-blue-700 rounded-full transition-colors disabled:opacity-50"
                disabled={!currentProject}
              >
                {timeline.isPlaying ? (
                  <Pause className="h-6 w-6" />
                ) : (
                  <Play className="h-6 w-6" />
                )}
              </button>
              
              <button
                onClick={() => seek(timeline.duration)}
                className="p-2 hover:bg-gray-700 rounded-md transition-colors"
                disabled={!currentProject}
              >
                <SkipForward className="h-5 w-5" />
              </button>
              
              <div className="flex items-center space-x-4 ml-8">
                <span className="text-sm text-gray-400">
                  {formatTime(timeline.currentTime)}
                </span>
                <div className="w-96 h-1 bg-gray-700 rounded-full">
                  <div 
                    className="h-1 bg-blue-600 rounded-full transition-all duration-100"
                    style={{ 
                      width: timeline.duration > 0 
                        ? `${(timeline.currentTime / timeline.duration) * 100}%` 
                        : '0%' 
                    }}
                  />
                </div>
                <span className="text-sm text-gray-400">
                  {formatTime(timeline.duration)}
                </span>
              </div>
            </div>
          </div>

          {/* Timeline Area */}
          <div className="h-64 bg-gray-850 border-t border-gray-700">
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-full h-32 bg-gray-800 rounded-lg flex items-center justify-center mb-4">
                  <div className="text-gray-600">
                    <div className="h-8 w-96 bg-gray-700 rounded mb-2"></div>
                    <div className="h-8 w-96 bg-gray-700 rounded mb-2"></div>
                    <div className="h-8 w-96 bg-gray-700 rounded"></div>
                  </div>
                </div>
                <p className="text-gray-400">Timeline</p>
                <p className="text-sm text-gray-500 mt-2">
                  Timeline will be implemented in Phase 3
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-80 bg-gray-800 border-l border-gray-700">
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4">Project Info</h3>
            
            {currentProject ? (
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400">Title</label>
                  <p className="text-white">{currentProject.title}</p>
                </div>
                
                <div>
                  <label className="text-sm text-gray-400">Duration</label>
                  <p className="text-white">{formatTime(currentProject.duration)}</p>
                </div>
                
                <div>
                  <label className="text-sm text-gray-400">Resolution</label>
                  <p className="text-white">
                    {currentProject.resolution.width} × {currentProject.resolution.height}
                  </p>
                </div>
                
                <div>
                  <label className="text-sm text-gray-400">Frame Rate</label>
                  <p className="text-white">{currentProject.fps} fps</p>
                </div>
                
                <div>
                  <label className="text-sm text-gray-400">Tracks</label>
                  <p className="text-white">{currentProject.tracks.length} tracks</p>
                </div>
              </div>
            ) : (
              <p className="text-gray-400">No project loaded</p>
            )}

            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-4">Phase 1 Progress</h3>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm">Project Setup ✓</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm">FFmpeg Integration ✓</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm">File Upload ✓</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm">State Management ✓</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <span className="text-sm">S3 Storage (Next)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                  <span className="text-sm">Video Player (Phase 2)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                  <span className="text-sm">Timeline (Phase 3)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
