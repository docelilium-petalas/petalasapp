'use client'

import { useState, useEffect, useCallback } from 'react'
import {
    Search,
    FolderPlus,
    Folder,
    Video,
    Download,
    Trash2,
    MoreHorizontal,
    Play,
    X,
    FolderOpen,
    Move,
    Plus,
    Clock,
    LayoutGrid,
    List,
} from 'lucide-react'
import { formatDate, cn, getStatusColor, getStatusLabel } from '@/lib/utils'
import toast from 'react-hot-toast'

interface VideoItem {
    id: string
    nome_produto: string
    formato: string
    duracao: number
    status: string
    video_url: string | null
    pasta_id: string | null
    created_at: string
}

interface PastaItem {
    id: string
    nome: string
    created_at: string
}

const FORMATO_LABELS: Record<string, string> = {
    instagram: 'Instagram',
    stories: 'Stories',
    educativo: 'Educativo',
    divulgacao: 'Divulgacao',
}

export default function BibliotecaPage() {
    const [videos, setVideos] = useState<VideoItem[]>([])
    const [pastas, setPastas] = useState<PastaItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [filterFormato, setFilterFormato] = useState('todos')
    const [filterStatus, setFilterStatus] = useState('todos')
    const [selectedPasta, setSelectedPasta] = useState<string | null>(null)
    const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null)
    const [activeMenu, setActiveMenu] = useState<string | null>(null)
    const [newFolderName, setNewFolderName] = useState('')
    const [showNewFolder, setShowNewFolder] = useState(false)
    const [movingVideo, setMovingVideo] = useState<string | null>(null)

    const loadData = useCallback(async () => {
        setIsLoading(true)
        try {
            const [videosRes, pastasRes] = await Promise.all([
                fetch('/api/creator/videos'),
                fetch('/api/creator/pastas'),
            ])
            if (videosRes.ok) setVideos(await videosRes.json())
            if (pastasRes.ok) setPastas(await pastasRes.json())
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        loadData()
    }, [loadData])

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return

        const res = await fetch('/api/creator/pastas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome: newFolderName.trim() }),
        })

        if (!res.ok) {
            toast.error('Erro ao criar pasta')
        } else {
            toast.success('Pasta criada!')
            setNewFolderName('')
            setShowNewFolder(false)
            loadData()
        }
    }

    const handleDeleteVideo = async (video: VideoItem) => {
        if (!confirm(`Excluir "${video.nome_produto}"?`)) return
        const res = await fetch(`/api/creator/videos/${video.id}`, { method: 'DELETE' })
        if (!res.ok) {
            toast.error('Erro ao excluir vídeo')
        } else {
            toast.success('Vídeo excluído')
            loadData()
        }
        setActiveMenu(null)
    }

    const handleMoveVideo = async (videoId: string, pastaId: string | null) => {
        const res = await fetch(`/api/creator/videos/${videoId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pasta_id: pastaId }),
        })
        if (!res.ok) {
            toast.error('Erro ao mover vídeo')
        } else {
            toast.success('Vídeo movido!')
            loadData()
        }
        setMovingVideo(null)
        setActiveMenu(null)
    }

    const filteredVideos = videos.filter((v) => {
        const matchSearch = v.nome_produto.toLowerCase().includes(search.toLowerCase())
        const matchFormato = filterFormato === 'todos' || v.formato === filterFormato
        const matchStatus = filterStatus === 'todos' || v.status === filterStatus
        const matchPasta =
            selectedPasta === null
                ? true
                : selectedPasta === 'rascunhos'
                    ? v.status === 'processando'
                    : selectedPasta === 'sem-pasta'
                        ? !v.pasta_id
                        : v.pasta_id === selectedPasta
        return matchSearch && matchFormato && matchStatus && matchPasta
    })

    const videosByPasta = (pastaId: string | null) =>
        videos.filter((v) => v.pasta_id === pastaId).length

    return (
        <div className="flex flex-col lg:flex-row min-h-screen bg-surface-50">
            {/* Folder Sidebar */}
            <aside className="w-full lg:w-72 flex-shrink-0 bg-white border-r border-surface-200 p-8 flex flex-col gap-8">
                <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Folders</h3>
                    <button
                        onClick={() => setShowNewFolder(true)}
                        className="w-8 h-8 rounded-xl bg-primary/5 text-primary hover:bg-primary hover:text-white transition-all flex items-center justify-center"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>

                {showNewFolder && (
                    <div className="flex gap-2 animate-fade-in">
                        <input
                            type="text"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreateFolder()
                                if (e.key === 'Escape') setShowNewFolder(false)
                            }}
                            placeholder="New folder..."
                            autoFocus
                            className="w-full bg-surface-50 border-2 border-transparent focus:border-primary/20 rounded-xl px-3 py-2 text-sm font-bold text-text-primary outline-none"
                        />
                    </div>
                )}

                <nav className="space-y-1">
                    <button
                        onClick={() => setSelectedPasta(null)}
                        className={cn(
                            'w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-bold text-sm group',
                            selectedPasta === null 
                                ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                                : 'text-text-muted hover:bg-surface-50 hover:text-text-primary'
                        )}
                    >
                        <LayoutGrid className="w-4 h-4" />
                        All Videos
                        <span className={cn(
                            'ml-auto text-[10px] font-black px-2 py-0.5 rounded-full',
                            selectedPasta === null ? 'bg-white/20' : 'bg-surface-100 text-text-muted'
                        )}>{videos.length}</span>
                    </button>

                    <button
                        onClick={() => setSelectedPasta('sem-pasta')}
                        className={cn(
                            'w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-bold text-sm group',
                            selectedPasta === 'sem-pasta'
                                ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                                : 'text-text-muted hover:bg-surface-50 hover:text-text-primary'
                        )}
                    >
                        <FolderOpen className="w-4 h-4" />
                        Unsorted
                        <span className={cn(
                            'ml-auto text-[10px] font-black px-2 py-0.5 rounded-full',
                            selectedPasta === 'sem-pasta' ? 'bg-white/20' : 'bg-surface-100 text-text-muted'
                        )}>{videosByPasta(null)}</span>
                    </button>

                    <button
                        onClick={() => setSelectedPasta('rascunhos')}
                        className={cn(
                            'w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-bold text-sm group',
                            selectedPasta === 'rascunhos'
                                ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                                : 'text-text-muted hover:bg-surface-50 hover:text-text-primary'
                        )}
                    >
                        <Clock className="w-4 h-4" />
                        Drafts
                        <span className={cn(
                            'ml-auto text-[10px] font-black px-2 py-0.5 rounded-full',
                            selectedPasta === 'rascunhos' ? 'bg-white/20' : 'bg-surface-100 text-text-muted'
                        )}>{videos.filter((v) => v.status === 'processando').length}</span>
                    </button>
                    
                    <div className="h-[1px] bg-surface-100 my-6" />

                    <div className="space-y-1">
                        {pastas.map((pasta) => (
                            <button
                                key={pasta.id}
                                onClick={() => setSelectedPasta(pasta.id)}
                                className={cn(
                                    'w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-bold text-sm group',
                                    selectedPasta === pasta.id
                                        ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                                        : 'text-text-muted hover:bg-surface-50 hover:text-text-primary'
                                )}
                            >
                                <Folder className="w-4 h-4" />
                                <span className="truncate">{pasta.nome}</span>
                            </button>
                        ))}
                    </div>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-8 lg:p-12">
                <div className="flex flex-col gap-8 max-w-7xl mx-auto">
                    <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                        <div>
                            <h1 className="text-4xl font-black text-text-primary tracking-tight">Content Library</h1>
                            <p className="text-text-muted mt-2 font-medium">Manage and organize your generated assets.</p>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="relative group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-primary transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Search library..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="bg-white border border-surface-200 focus:border-primary/20 rounded-2xl pl-12 pr-6 py-3 text-sm font-bold text-text-primary outline-none shadow-sm transition-all w-80"
                                />
                            </div>
                            
                            <select
                                value={filterFormato}
                                onChange={(e) => setFilterFormato(e.target.value)}
                                className="bg-white border border-surface-200 rounded-2xl px-6 py-3 text-sm font-bold text-text-primary outline-none shadow-sm cursor-pointer"
                            >
                                <option value="todos">All formats</option>
                                <option value="instagram">Instagram</option>
                                <option value="stories">Stories</option>
                                <option value="educativo">Educativo</option>
                            </select>
                        </div>
                    </header>

                    {/* Grid */}
                    {isLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="bg-white rounded-3xl p-4 shadow-sm border border-surface-100 animate-pulse">
                                    <div className="w-full aspect-video bg-surface-100 rounded-2xl mb-4" />
                                    <div className="h-4 bg-surface-100 rounded-full w-3/4 mb-2" />
                                    <div className="h-3 bg-surface-50 rounded-full w-1/2" />
                                </div>
                            ))}
                        </div>
                    ) : filteredVideos.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-32 text-center">
                            <div className="w-20 h-20 rounded-3xl bg-surface-100 flex items-center justify-center text-surface-300 mb-6">
                                <Video className="w-10 h-10" />
                            </div>
                            <h3 className="text-xl font-bold text-text-primary">No videos found</h3>
                            <p className="text-text-muted mt-2">Start creating your bloom of content.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filteredVideos.map((video) => (
                                <div key={video.id} className="group bg-white rounded-[32px] p-4 shadow-sm border border-surface-100 hover:border-primary/20 hover:shadow-premium transition-all relative">
                                    {/* Thumbnail */}
                                    <div
                                        className="relative w-full aspect-video rounded-[24px] overflow-hidden bg-surface-50 mb-4 cursor-pointer group-hover:scale-[1.02] transition-transform"
                                        onClick={() => setSelectedVideo(video)}
                                    >
                                        {video.video_url && video.status === 'concluido' ? (
                                            <video src={video.video_url} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Video className={cn(
                                                    "w-8 h-8",
                                                    video.status === 'processando' ? 'text-primary animate-pulse' : 'text-surface-200'
                                                )} />
                                            </div>
                                        )}
                                        {video.status === 'concluido' && (
                                            <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <div className="w-12 h-12 rounded-2xl bg-white shadow-xl flex items-center justify-center text-primary">
                                                    <Play className="w-5 h-5 fill-current" />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="px-1">
                                        <h4 className="text-sm font-black text-text-primary truncate mb-1">
                                            {video.nome_produto}
                                        </h4>
                                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-text-muted">
                                            <span>{formatDate(video.created_at)}</span>
                                            <span className="text-primary">{video.formato}</span>
                                        </div>
                                    </div>

                                    {/* Actions menu */}
                                    <div className="absolute top-6 right-6">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setActiveMenu(activeMenu === video.id ? null : video.id)
                                            }}
                                            className="w-8 h-8 rounded-xl bg-white/90 backdrop-blur shadow-sm flex items-center justify-center text-text-muted hover:text-text-primary transition-all"
                                        >
                                            <MoreHorizontal className="w-4 h-4" />
                                        </button>

                                        {activeMenu === video.id && (
                                            <div className="absolute right-0 mt-2 w-48 bg-white border border-surface-200 rounded-2xl shadow-2xl z-20 py-2 animate-fade-in">
                                                {video.video_url && (
                                                    <a
                                                        href={video.video_url}
                                                        download
                                                        onClick={() => setActiveMenu(null)}
                                                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-text-secondary hover:bg-surface-50 transition-colors"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                        Download
                                                    </a>
                                                )}
                                                <button
                                                    onClick={() => setMovingVideo(movingVideo === video.id ? null : video.id)}
                                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-text-secondary hover:bg-surface-50 transition-colors"
                                                >
                                                    <Move className="w-4 h-4" />
                                                    Move to folder
                                                </button>
                                                <div className="h-[1px] bg-surface-100 my-2" />
                                                <button
                                                    onClick={() => handleDeleteVideo(video)}
                                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-50 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                    Delete
                                                </button>
                                            </div>
                                        )}

                                        {/* Move to folder sub-menu */}
                                        {movingVideo === video.id && (
                                            <div className="absolute right-0 mt-2 w-48 bg-white border border-surface-200 rounded-2xl shadow-2xl z-30 py-2 animate-fade-in">
                                                <p className="px-4 py-2 text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-surface-100 mb-2">Move to</p>
                                                <button
                                                    onClick={() => handleMoveVideo(video.id, null)}
                                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-text-secondary hover:bg-surface-50 transition-colors"
                                                >
                                                    <FolderOpen className="w-4 h-4" />
                                                    Home Library
                                                </button>
                                                {pastas.map((pasta) => (
                                                    <button
                                                        key={pasta.id}
                                                        onClick={() => handleMoveVideo(video.id, pasta.id)}
                                                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-text-secondary hover:bg-surface-50 transition-colors"
                                                    >
                                                        <Folder className="w-4 h-4" />
                                                        {pasta.nome}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Video Preview Modal */}
            {selectedVideo && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-text-primary/40 backdrop-blur-md animate-fade-in"
                        onClick={() => setSelectedVideo(null)}
                    />
                    <div className="relative z-10 bg-white border border-surface-200 rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden animate-fade-in-up">
                        <div className="flex items-center justify-between p-8">
                            <div>
                                <h3 className="text-2xl font-black text-text-primary tracking-tight">{selectedVideo.nome_produto}</h3>
                                <div className="flex items-center gap-4 mt-2">
                                    <span className="text-[10px] font-black text-primary uppercase tracking-widest bg-primary/5 px-3 py-1 rounded-full">
                                        {selectedVideo.formato}
                                    </span>
                                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">{selectedVideo.duracao} Seconds</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedVideo(null)}
                                className="w-12 h-12 rounded-2xl bg-surface-50 text-text-muted hover:text-text-primary transition-colors flex items-center justify-center"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="px-8 pb-8">
                            <div className="relative aspect-video rounded-[32px] overflow-hidden bg-surface-50 border border-surface-100">
                                {selectedVideo.video_url ? (
                                    <video
                                        src={selectedVideo.video_url}
                                        controls
                                        autoPlay
                                        className="w-full h-full object-contain"
                                    />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-text-muted gap-4">
                                        <div className="w-16 h-16 rounded-3xl bg-surface-100 flex items-center justify-center">
                                            <Clock className="w-8 h-8 animate-pulse text-primary" />
                                        </div>
                                        <p className="font-bold">Content is blooming...</p>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-4 mt-8">
                                {selectedVideo.video_url && (
                                    <a
                                        href={selectedVideo.video_url}
                                        download
                                        className="flex-1 bg-primary text-white font-black py-4 rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                    >
                                        <Download className="w-5 h-5" />
                                        DOWNLOAD HD
                                    </a>
                                )}
                                <button
                                    onClick={() => setSelectedVideo(null)}
                                    className="flex-1 bg-surface-50 text-text-primary font-black py-4 rounded-2xl hover:bg-surface-100 transition-all"
                                >
                                    CLOSE
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

