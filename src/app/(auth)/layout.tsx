import { type ReactNode } from 'react'
import { Sparkles, CheckCircle2 } from 'lucide-react'

export default function AuthLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen flex bg-bg-main" style={{ fontFamily: 'var(--font-sans), sans-serif' }}>
            {/* Left Panel - Editorial Style */}
            <div className="hidden lg:flex lg:w-[48%] bg-white border-r border-primary/5 p-20 flex-col justify-between relative overflow-hidden">
                {/* Background Pattern/Texture (Subtle) */}
                <div className="absolute top-0 right-0 w-full h-full opacity-[0.03] pointer-events-none p-20 flex items-center justify-center">
                    <span className="text-[400px] font-display italic text-primary select-none rotate-12">L</span>
                </div>

                <div className="relative z-10 flex flex-col items-start">
                    <img 
                        src="/images/logo.png" 
                        alt="" 
                        className="h-48 w-auto object-contain -ml-6" 
                    />
                </div>

                <div className="relative z-10 space-y-12">
                    <div className="space-y-6">
                        <h1 className="text-6xl font-semibold text-text-primary leading-[1.1] font-display italic">
                            Onde a moda encontra a precisão.
                        </h1>
                        <p className="text-text-muted text-lg leading-relaxed max-w-md font-medium">
                            Potencializamos sua curadoria com inteligência, design e performance de alta costura.
                        </p>
                    </div>

                    <div className="space-y-4">
                        {[
                            'Produção Audiovisual de Luxo',
                            'Gestão de Coleções e Audiência',
                            'Insights de Alta Performance',
                        ].map((item) => (
                            <div key={item} className="flex items-center gap-4">
                                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center border border-primary/5 shadow-inner">
                                    <Sparkles className="w-2.5 h-2.5 text-primary" />
                                </div>
                                <span className="text-xs uppercase tracking-widest font-black text-text-secondary opacity-80">{item}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <p className="relative z-10 text-[10px] uppercase tracking-widest font-black text-text-muted flex items-center gap-2">
                   <span className="w-8 h-px bg-primary/20" />
                    © 2024 · Doce Lilium
                </p>
            </div>

            {/* Right Panel — Auth Form */}
            <div className="flex-1 flex items-center justify-center p-8 lg:p-20 bg-bg-main relative overflow-hidden">
                {/* Decorative Elements */}
                <div className="absolute top-[-100px] right-[-100px] w-80 h-80 rounded-full bg-primary/5 blur-3xl" />
                <div className="absolute bottom-[-50px] left-[-50px] w-60 h-60 rounded-full bg-primary/5 blur-3xl" />

                <div className="w-full max-w-md relative z-10 bg-white p-12 lg:p-16 rounded-[48px] shadow-soft border border-primary/5 animate-scale-up">
                    {/* Mobile Logo */}
                    <div className="lg:hidden flex flex-col items-center justify-center mb-12">
                         <img 
                            src="/images/logo.png" 
                            alt="" 
                            className="h-24 w-auto object-contain" 
                        />
                    </div>

                    {children}
                </div>
            </div>
        </div>
    )
}
