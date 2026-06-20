'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit3, Trash2, Tag, Play } from 'lucide-react'
import { toast } from 'sonner'

export default function GestaoNichosTab() {
  const queryClient = useQueryClient()
  
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    nome: '',
    promptN8n: '',
    status: 'ativo'
  })

  // Fetch niches
  const { data: niches = [], isLoading } = useQuery({
    queryKey: ['niches'],
    queryFn: () => fetch('/api/admin/niches').then(r => r.json())
  })

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/admin/niches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (!res.ok) throw new Error('Erro ao criar')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['niches'] })
      toast.success('Nicho criado com sucesso!')
      handleCloseForm()
    },
    onError: () => toast.error('Falha ao criar nicho')
  })

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; payload: any }) => {
      const res = await fetch(`/api/admin/niches?id=${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.payload)
      })
      if (!res.ok) throw new Error('Erro ao atualizar')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['niches'] })
      toast.success('Nicho atualizado com sucesso!')
      handleCloseForm()
    },
    onError: () => toast.error('Falha ao atualizar nicho')
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/niches?id=${id}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error('Erro ao excluir')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['niches'] })
      toast.success('Nicho excluído')
    },
    onError: () => toast.error('Falha ao excluir nicho')
  })

  const handleOpenForm = (niche?: any) => {
    if (niche) {
      setEditingId(niche.id)
      setFormData({
        nome: niche.nome,
        promptN8n: niche.promptN8n || '',
        status: niche.status
      })
    } else {
      setEditingId(null)
      setFormData({
        nome: '',
        promptN8n: '',
        status: 'ativo'
      })
    }
    setShowForm(true)
  }

  const handleCloseForm = () => {
    setShowForm(false)
    setEditingId(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.nome.trim()) {
      toast.error('O nome do nicho é obrigatório')
      return
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, payload: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  const handleDelete = (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este nicho?')) {
      deleteMutation.mutate(id)
    }
  }

  const handleToggleStatus = (niche: any) => {
    const newStatus = niche.status === 'ativo' ? 'inativo' : 'ativo'
    updateMutation.mutate({
      id: niche.id,
      payload: { status: newStatus }
    })
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-wide text-foreground flex items-center gap-2">
            <Tag className="w-5 h-5 text-primary" />
            Configuração de Nichos
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cadastre os nichos de mercado e os prompts específicos que a IA do N8N usará para avaliar os leads
          </p>
        </div>

        {!showForm && (
          <button
            onClick={() => handleOpenForm()}
            className="px-4 py-2 rounded-xl bg-primary text-black font-extrabold text-xs flex items-center gap-2 hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> Novo Nicho
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="p-6 rounded-3xl border border-primary/20 bg-primary/5 space-y-4 animate-scale-in">
          <span className="text-xs font-bold text-primary block uppercase tracking-wider">
            {editingId ? 'Editar Nicho' : 'Novo Nicho'}
          </span>
          
          <div className="space-y-4">
            <div>
              <label className="ocr-label mb-1.5 block">Nome do Nicho</label>
              <input
                type="text"
                placeholder="Ex: Clínicas Odontológicas"
                value={formData.nome}
                onChange={e => setFormData(p => ({ ...p, nome: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-secondary text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground"
              />
            </div>
            
            <div>
              <label className="ocr-label mb-1.5 block">Prompt / Regras para Mineração N8N (Opcional)</label>
              <textarea
                placeholder="Ex: Buscar apenas clínicas que tenham implantes no site, ignorar dentistas autônomos..."
                value={formData.promptN8n}
                onChange={e => setFormData(p => ({ ...p, promptN8n: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl border border-border bg-secondary text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground min-h-[100px] resize-y"
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="ocr-label">Status Inicial:</label>
              <select
                value={formData.status}
                onChange={e => setFormData(p => ({ ...p, status: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-secondary text-xs focus:outline-none text-foreground"
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 text-xs pt-4 border-t border-border/20">
            <button
              type="button"
              onClick={handleCloseForm}
              className="px-4 py-2 rounded-xl border border-border text-muted-foreground hover:bg-secondary font-bold transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-5 py-2 rounded-xl bg-primary text-black font-extrabold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              {editingId ? 'Salvar Alterações' : 'Cadastrar Nicho'}
            </button>
          </div>
        </form>
      )}

      {/* Niches List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-8 text-xs text-muted-foreground italic">Carregando nichos...</div>
        ) : !Array.isArray(niches) || niches.length === 0 ? (
          <div className="text-center py-10 text-xs text-muted-foreground italic border border-dashed border-border/20 rounded-3xl bg-secondary">
            Nenhum nicho configurado. Crie o primeiro nicho acima.
          </div>
        ) : (
          niches.map((niche: any) => (
            <div key={niche.id} className="p-5 rounded-2xl border border-border/30 bg-card backdrop-blur-sm flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-border/60 transition-all">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-foreground text-sm">{niche.nome}</h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    niche.status === 'ativo' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-muted text-muted-foreground border border-border'
                  }`}>
                    {niche.status}
                  </span>
                </div>
                {niche.promptN8n && (
                  <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2 pr-4">
                    <strong className="text-muted-foreground">Prompt:</strong> {niche.promptN8n}
                  </p>
                )}
                <div className="text-[10px] text-muted-foreground mt-2">
                  Criado em {new Date(niche.createdAt).toLocaleDateString('pt-BR')}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleToggleStatus(niche)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                    niche.status === 'ativo' 
                      ? 'border-border text-muted-foreground hover:bg-secondary' 
                      : 'border-primary/30 text-primary bg-primary/5 hover:bg-primary/10'
                  }`}
                >
                  {niche.status === 'ativo' ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  onClick={() => handleOpenForm(niche)}
                  className="p-2 rounded-xl bg-secondary border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                  title="Editar"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(niche.id)}
                  className="p-2 rounded-xl bg-secondary border border-border hover:bg-rose-500/10 text-muted-foreground hover:text-rose-400 transition-all"
                  title="Excluir"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
