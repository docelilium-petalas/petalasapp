import { type ReactNode } from 'react'
import { Sparkles, CheckCircle2, TrendingUp, Smartphone } from 'lucide-react'

export default function AuthLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen flex bg-white font-outfit">
            {/* Left Panel - Hero/Mockup Display */}
            <div className="hidden lg:flex lg:w-[55%] bg-surface-50 p-16 flex-col justify-between relative overflow-hidden">
                {/* Background Blobs */}
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px] -mr-40 -mt-40" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[100px] -ml-20 -mb-20" />

                <div className="relative z-10 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                        <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-2xl font-black text-text-primary tracking-tight italic">Pétalas</span>
                </div>

                <div className="relative z-10 flex flex-col items-center justify-center">
                    {/* Mockup Display */}
                    <div className="relative group max-w-md w-full">
                        {/* iPhone Frame */}
                        <div className="relative mx-auto w-[280px] aspect-[9/19] bg-text-primary rounded-[48px] p-2 shadow-2xl ring-8 ring-surface-200 overflow-hidden transform group-hover:scale-[1.02] transition-transform duration-700">
                            <div className="w-full h-full rounded-[40px] overflow-hidden bg-primary/5 relative">
                                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/5" />
                                <div className="p-6 pt-12 space-y-4">
                                    <div className="h-4 w-2/3 bg-primary/20 rounded-full animate-pulse" />
                                    <div className="h-32 w-full bg-white rounded-2xl shadow-sm border border-primary/5 relative overflow-hidden">
                                        <div className="absolute inset-0 bg-primary/5" />
                                        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                                            <div className="h-2 w-1/3 bg-primary/20 rounded-full" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="h-4 w-1/2 bg-surface-200 rounded-full" />
                                        <div className="h-4 w-3/4 bg-surface-100 rounded-full" />
                                    </div>
                                </div>
                                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-48 h-10 bg-primary rounded-xl shadow-lg" />
                            </div>
                        </div>

                        {/* Floating Labels */}
                        <div className="absolute -top-10 -right-10 bg-white p-6 rounded-3xl shadow-xl border border-surface-100 animate-bounce-slow">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-black text-text-muted uppercase tracking-widest leading-none mb-1">TOTAL IMPACT</span>
                                <span className="text-3xl font-black text-text-primary tracking-tighter shrink-0">+4.2k <span className="text-sm font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full ml-1">↑12%</span></span>
                                <span className="text-[10px] text-text-muted font-medium">Videos generated this month</span>
                            </div>
                        </div>

                        <div className="absolute bottom-20 -left-16 bg-white p-4 rounded-2xl shadow-lg border border-surface-100 animate-slide-left-slow">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-accent text-white flex items-center justify-center">
                                    <Sparkles className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-accent uppercase tracking-widest leading-none mb-1">AI STRATEGY</p>
                                    <p className="text-[10px] font-bold text-text-primary">Optimized for Instagram Reels</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-20 text-center max-w-md space-y-6">
                        <h1 className="text-5xl font-black text-text-primary tracking-tight leading-[1.1]">
                            The future of content <span className="text-primary">creation</span> is blooming.
                        </h1>
                        <div className="flex flex-col items-center gap-4 text-text-muted font-bold text-sm">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="w-5 h-5 text-primary" />
                                <span>AI-Powered Content Automation</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="w-5 h-5 text-primary" />
                                <span>Multi-platform Strategic Insights</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 flex items-center justify-between text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">
                    <span>© 2024 PÉTALAS AI</span>
                    <div className="flex gap-6">
                        <span>PRIVACY</span>
                        <span>TERMS</span>
                    </div>
                </div>
            </div>

            {/* Right Panel - Auth Form */}
            <div className="flex-1 flex items-center justify-center p-8 lg:p-12 relative overflow-hidden">
                {/* Background Glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/3 rounded-full blur-[150px] pointer-events-none" />
                
                <div className="w-full max-w-sm relative z-10 animate-fade-in-up">
                    {/* Mobile Logo Only */}
                    <div className="lg:hidden flex items-center justify-center gap-2 mb-12">
                        <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-2xl font-black text-text-primary tracking-tight italic">Pétalas</span>
                    </div>

                    {children}
                </div>
            </div>
        </div>
    )
}

