import React, { useState, useEffect, useMemo } from 'react';
import { 
  Settings, LayoutDashboard, Share2, Bot, Database, 
  Activity, FileText, Palette, Globe, Sun, Moon,
  Shuffle, Zap, TrendingUp, Search, Info, Upload, FileUp, List, ChevronDown, ChevronRight,
  PieChart as PieChartIcon
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
  PieChart, Pie, Cell, LineChart, Line, RadialBarChart, RadialBar, Legend, ScatterChart, Scatter
} from 'recharts';

import { 
  PainterStyle, MedFlowRow, FilterState, AgentSpec, PipelineRun, TabId 
} from './types';
import { PAINTER_STYLES, DEFAULT_AGENTS } from './constants';
import { parseRawInput, summarizeData } from './utils/csvParser';
import { generateContent, generatePrediction, generateInsight } from './services/geminiService';
import NetworkGraph from './components/NetworkGraph';
import { DEFAULT_DATASET } from './defaultDataset';

function App() {
  // --- State ---
  const [dataInput, setDataInput] = useState('');
  const [rawData, setRawData] = useState<MedFlowRow[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  
  // Appearance
  const [themeMode, setThemeMode] = useState<'light'|'dark'>('dark');
  const [lang, setLang] = useState<'en'|'zh-TW'>('en');
  const [currentStyleId, setCurrentStyleId] = useState<string>(PAINTER_STYLES[0].id);

  // Filters
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    date_min: null, date_max: null, suppliers: [], customers: [], categories: [],
    licenseNo: '', model: '', lotNo: '', serNo: '', timeZone: 'UTC+8',
    top_n: 10, edge_threshold: 1, max_nodes: 100
  });

  // Data Preview
  const [previewLimit, setPreviewLimit] = useState(20);

  // AI & WOW Features
  const [pipelineRuns, setPipelineRuns] = useState<PipelineRun[]>([]);
  const [insightFlash, setInsightFlash] = useState<string | null>(null);
  const [predictionPulse, setPredictionPulse] = useState<string | null>(null);
  const [semanticQuery, setSemanticQuery] = useState('');
  const [isProcessingAI, setIsProcessingAI] = useState(false);

  // --- Computed ---
  const currentStyle = useMemo(() => 
    PAINTER_STYLES.find(s => s.id === currentStyleId) || PAINTER_STYLES[0], 
    [currentStyleId]
  );

  const filteredData = useMemo(() => {
    if(!rawData.length) return [];
    return rawData.filter(r => {
        if(filters.suppliers.length && !filters.suppliers.includes(r.SupplierID)) return false;
        if(filters.customers.length && !filters.customers.includes(r.CustomerID)) return false;
        if(filters.categories.length && !filters.categories.includes(r.Category)) return false;
        
        // Advanced Text Filters (Case Insensitive Partial Match)
        if(filters.licenseNo && !r.LicenseNo.toLowerCase().includes(filters.licenseNo.toLowerCase())) return false;
        if(filters.model && !r.Model.toLowerCase().includes(filters.model.toLowerCase())) return false;
        if(filters.lotNo && !r.LotNO.toLowerCase().includes(filters.lotNo.toLowerCase())) return false;
        if(filters.serNo && !r.SerNo.toLowerCase().includes(filters.serNo.toLowerCase())) return false;
        
        return true;
    });
  }, [rawData, filters]);

  const summary = useMemo(() => summarizeData(filteredData), [filteredData]);

  // --- Effects ---
  useEffect(() => {
    // Load default dataset on start
    setRawData(parseRawInput(JSON.stringify(DEFAULT_DATASET)));
  }, []);

  useEffect(() => {
    // Apply CSS Variables
    const root = document.documentElement;
    const isDark = themeMode === 'dark';
    
    root.style.setProperty('--mf-bg', isDark ? currentStyle.bg_from : '#F7F8FB');
    root.style.setProperty('--mf-text', isDark ? '#EAF0FF' : '#0F172A');
    root.style.setProperty('--mf-accent', currentStyle.accent);
    root.style.setProperty('--mf-card', isDark ? currentStyle.card_rgba_dark : currentStyle.card_rgba_light);
    root.style.setProperty('--mf-border', isDark ? currentStyle.border_rgba_dark : currentStyle.border_rgba_light);
    root.style.setProperty('--mf-font', currentStyle.font);
    root.style.setProperty('--mf-grad-from', currentStyle.bg_from);
    root.style.setProperty('--mf-grad-to', currentStyle.bg_to);
  }, [currentStyle, themeMode]);

  // --- Handlers ---
  const handleJackpot = () => {
    const others = PAINTER_STYLES.filter(s => s.id !== currentStyleId);
    const random = others[Math.floor(Math.random() * others.length)];
    setCurrentStyleId(random.id);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if(!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        const text = evt.target?.result as string;
        if(text) {
            setDataInput(text);
            const parsed = parseRawInput(text);
            setRawData(parsed);
            alert(`Loaded ${parsed.length} records from ${file.name}`);
        }
    };
    reader.readAsText(file);
  };

  const loadDefaultDataset = () => {
      const data = parseRawInput(JSON.stringify(DEFAULT_DATASET));
      setRawData(data);
      setDataInput(JSON.stringify(DEFAULT_DATASET, null, 2));
      alert("Reset to System Default Dataset");
  };

  const runPredictionPulse = async () => {
      if(!filteredData.length) return;
      setIsProcessingAI(true);
      try {
          const res = await generatePrediction(JSON.stringify(summary.top_categories));
          setPredictionPulse(res);
      } catch(e) { console.error(e); }
      setIsProcessingAI(false);
  };

  const runInsightFlash = async () => {
      if(!filteredData.length) return;
      setIsProcessingAI(true);
      try {
          const res = await generateInsight(JSON.stringify(summary));
          setInsightFlash(res);
      } catch(e) { console.error(e); }
      setIsProcessingAI(false);
  };

  const runPipeline = async () => {
      if(!filteredData.length) return;
      setIsProcessingAI(true);
      const runId = Date.now().toString();
      const newRun: PipelineRun = { id: runId, timestamp: Date.now(), agentOutputs: {}, status: 'running' };
      setPipelineRuns(prev => [newRun, ...prev]);

      try {
          const context = JSON.stringify(summary);
          const outputs: Record<string, string> = {};
          
          for(const agent of DEFAULT_AGENTS) {
              const prompt = agent.user_prompt_template.replace('{{data_summary}}', context).replace('{{data_sample}}', '');
              const res = await generateContent(agent.model, prompt, agent.system_prompt, agent.temperature, agent.max_tokens);
              outputs[agent.id] = res;
              
              setPipelineRuns(prev => prev.map(r => 
                  r.id === runId ? { ...r, agentOutputs: { ...r.agentOutputs, [agent.id]: res } } : r
              ));
          }
          
          setPipelineRuns(prev => prev.map(r => r.id === runId ? { ...r, status: 'completed' } : r));
      } catch(e) {
          setPipelineRuns(prev => prev.map(r => r.id === runId ? { ...r, status: 'failed', error: String(e) } : r));
      }
      setIsProcessingAI(false);
  };

  // --- Renders ---
  return (
    <div className={`min-h-screen font-sans text-[var(--mf-text)] transition-colors duration-500`}
         style={{ background: `radial-gradient(circle at 18% 0%, var(--mf-grad-to) 0%, var(--mf-bg) 56%)` }}>
      
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-72 border-r border-[var(--mf-border)] bg-[rgba(255,255,255,0.01)] backdrop-blur-md p-6 flex flex-col gap-6 z-50 overflow-y-auto">
        <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
                <Activity className="text-[var(--mf-accent)]" /> MedFlow
            </h1>
            <p className="text-xs opacity-60">WOW Studio · Agentic Analytics</p>
        </div>

        {/* Controls */}
        <div className="space-y-4">
            <div className="bg-[var(--mf-card)] border border-[var(--mf-border)] rounded-xl p-4 space-y-3">
                <label className="text-xs font-bold uppercase opacity-50 flex items-center gap-2">
                    <Palette size={12}/> Style Engine
                </label>
                <div className="flex items-center justify-between">
                    <button onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
                        className="p-2 rounded-lg bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] transition">
                        {themeMode === 'dark' ? <Moon size={16}/> : <Sun size={16}/>}
                    </button>
                    <button onClick={() => setLang(lang === 'en' ? 'zh-TW' : 'en')}
                        className="text-xs font-bold px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.05)]">
                        {lang === 'en' ? 'EN' : '繁中'}
                    </button>
                </div>
                <select 
                    value={currentStyleId} 
                    onChange={(e) => setCurrentStyleId(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg bg-[rgba(0,0,0,0.2)] border border-[var(--mf-border)] text-[var(--mf-text)]">
                    {PAINTER_STYLES.map(s => (
                        <option key={s.id} value={s.id}>{lang === 'en' ? s.name_en : s.name_zh}</option>
                    ))}
                </select>
                <button onClick={handleJackpot}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-[var(--mf-accent)] text-black font-bold text-xs hover:opacity-90 transition">
                    <Shuffle size={14}/> Jackpot
                </button>
            </div>

            <div className="bg-[var(--mf-card)] border border-[var(--mf-border)] rounded-xl p-4 space-y-3">
                 <label className="text-xs font-bold uppercase opacity-50">Global Filters</label>
                 
                 {/* Primary Filters */}
                 <div className="space-y-2">
                    <label className="text-[10px] uppercase opacity-70">Supplier ({filters.suppliers.length || 'All'})</label>
                    <select multiple className="w-full h-16 text-xs p-2 rounded-lg bg-[rgba(0,0,0,0.2)] border border-[var(--mf-border)]"
                        onChange={(e) => {
                            const opts = Array.from(e.target.selectedOptions, (o: HTMLOptionElement) => o.value);
                            setFilters({...filters, suppliers: opts});
                        }}>
                        {Array.from(new Set(rawData.map(r => r.SupplierID).filter(Boolean))).map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                 </div>
                 
                 <div className="space-y-2">
                    <label className="text-[10px] uppercase opacity-70">Category ({filters.categories.length || 'All'})</label>
                     <select multiple className="w-full h-16 text-xs p-2 rounded-lg bg-[rgba(0,0,0,0.2)] border border-[var(--mf-border)]"
                        onChange={(e) => {
                            const opts = Array.from(e.target.selectedOptions, (o: HTMLOptionElement) => o.value);
                            setFilters({...filters, categories: opts});
                        }}>
                        {Array.from(new Set(rawData.map(r => r.Category).filter(Boolean))).map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                 </div>

                 {/* Advanced Filters Toggle */}
                 <button onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    className="w-full flex items-center justify-between text-xs font-bold uppercase opacity-70 hover:opacity-100 pt-2 border-t border-[var(--mf-border)]">
                    Advanced {showAdvancedFilters ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                 </button>

                 {showAdvancedFilters && (
                     <div className="space-y-3 pt-2 animate-in slide-in-from-top-2">
                         <div className="space-y-1">
                             <label className="text-[10px] opacity-60">License No</label>
                             <input type="text" className="w-full bg-[rgba(0,0,0,0.2)] border border-[var(--mf-border)] rounded px-2 py-1 text-xs" 
                                value={filters.licenseNo} onChange={e => setFilters({...filters, licenseNo: e.target.value})} placeholder="Filter License..."/>
                         </div>
                         <div className="space-y-1">
                             <label className="text-[10px] opacity-60">Model</label>
                             <input type="text" className="w-full bg-[rgba(0,0,0,0.2)] border border-[var(--mf-border)] rounded px-2 py-1 text-xs" 
                                value={filters.model} onChange={e => setFilters({...filters, model: e.target.value})} placeholder="Filter Model..."/>
                         </div>
                         <div className="space-y-1">
                             <label className="text-[10px] opacity-60">Lot No</label>
                             <input type="text" className="w-full bg-[rgba(0,0,0,0.2)] border border-[var(--mf-border)] rounded px-2 py-1 text-xs" 
                                value={filters.lotNo} onChange={e => setFilters({...filters, lotNo: e.target.value})} placeholder="Filter Lot..."/>
                         </div>
                         <div className="space-y-1">
                             <label className="text-[10px] opacity-60">Serial (SN)</label>
                             <input type="text" className="w-full bg-[rgba(0,0,0,0.2)] border border-[var(--mf-border)] rounded px-2 py-1 text-xs" 
                                value={filters.serNo} onChange={e => setFilters({...filters, serNo: e.target.value})} placeholder="Filter SN..."/>
                         </div>
                         <div className="space-y-1">
                             <label className="text-[10px] opacity-60">Time Zone</label>
                             <select className="w-full bg-[rgba(0,0,0,0.2)] border border-[var(--mf-border)] rounded px-2 py-1 text-xs"
                                value={filters.timeZone} onChange={e => setFilters({...filters, timeZone: e.target.value})}>
                                <option value="UTC">UTC</option>
                                <option value="UTC+8">UTC+8 (Taipei)</option>
                                <option value="EST">EST</option>
                             </select>
                         </div>
                     </div>
                 )}

                 <button onClick={() => setFilters({ ...filters, categories: [], suppliers: [], licenseNo: '', model: '', lotNo: '', serNo: '' })} 
                    className="text-xs w-full text-center opacity-50 hover:opacity-100 p-2 bg-[rgba(255,255,255,0.05)] rounded-lg">
                    Reset All Filters
                 </button>
            </div>
        </div>

        {/* WOW Features Sidebar */}
        <div className="mt-auto space-y-2">
            <button onClick={runInsightFlash} disabled={isProcessingAI}
                className="w-full flex items-center gap-2 p-3 rounded-xl border border-[var(--mf-border)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.05)] transition text-xs font-medium">
                <Zap size={14} className="text-yellow-400"/> {isProcessingAI ? '...' : 'Insight Flash'}
            </button>
            <button onClick={runPredictionPulse} disabled={isProcessingAI}
                className="w-full flex items-center gap-2 p-3 rounded-xl border border-[var(--mf-border)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.05)] transition text-xs font-medium">
                <TrendingUp size={14} className="text-green-400"/> {isProcessingAI ? '...' : 'Predictive Pulse'}
            </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-72 p-8 max-w-7xl mx-auto">
        
        {/* Top Bar */}
        <header className="flex items-center justify-between mb-8">
            <nav className="flex items-center gap-2 bg-[var(--mf-card)] border border-[var(--mf-border)] p-1 rounded-xl">
                {[
                    { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
                    { id: 'data', icon: Database, label: 'Data Manager' },
                    { id: 'network', icon: Share2, label: 'Network' },
                    { id: 'agents', icon: Bot, label: 'Agent Studio' },
                    { id: 'quality', icon: FileText, label: 'Quality' },
                ].map(tab => (
                    <button key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabId)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            activeTab === tab.id ? 'bg-[var(--mf-accent)] text-black shadow-lg shadow-[var(--mf-accent)]/20' : 'hover:bg-[rgba(255,255,255,0.05)]'
                        }`}>
                        <tab.icon size={16}/> {tab.label}
                    </button>
                ))}
            </nav>
            <div className="flex items-center gap-4">
                 <div className="relative group">
                    <Search className="absolute left-3 top-2.5 text-[var(--mf-text)] opacity-40" size={16}/>
                    <input 
                        type="text" 
                        placeholder="Semantic Search (AI)..."
                        value={semanticQuery}
                        onChange={(e) => setSemanticQuery(e.target.value)}
                        className="pl-9 pr-4 py-2 rounded-xl bg-[var(--mf-card)] border border-[var(--mf-border)] text-sm w-64 focus:ring-2 focus:ring-[var(--mf-accent)] outline-none transition-all"
                    />
                 </div>
            </div>
        </header>

        {/* WOW AI Feature Display */}
        {(insightFlash || predictionPulse) && (
             <div className="mb-8 grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-4">
                {insightFlash && (
                    <div className="p-4 rounded-xl border border-[var(--mf-border)] bg-gradient-to-br from-[var(--mf-card)] to-yellow-900/10">
                        <div className="flex items-center gap-2 text-yellow-400 text-xs font-bold uppercase mb-2"><Zap size={12}/> Flash Insight</div>
                        <p className="text-sm font-medium leading-relaxed">{insightFlash}</p>
                    </div>
                )}
                {predictionPulse && (
                    <div className="p-4 rounded-xl border border-[var(--mf-border)] bg-gradient-to-br from-[var(--mf-card)] to-green-900/10">
                        <div className="flex items-center gap-2 text-green-400 text-xs font-bold uppercase mb-2"><TrendingUp size={12}/> Pulse Prediction</div>
                        <p className="text-sm font-medium leading-relaxed">{predictionPulse}</p>
                    </div>
                )}
             </div>
        )}

        {/* Views */}
        <div className="animate-in fade-in duration-500">
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-4 gap-4">
                        {[
                            { label: 'Total Units', val: summary.total_units.toLocaleString(), icon: Activity },
                            { label: 'Suppliers', val: summary.unique.suppliers, icon: Globe },
                            { label: 'Customers', val: summary.unique.customers, icon: Share2 },
                            { label: 'Categories', val: summary.unique.categories, icon: Database },
                        ].map((k, i) => (
                            <div key={i} className="bg-[var(--mf-card)] border border-[var(--mf-border)] p-5 rounded-2xl">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-sm opacity-60 font-medium">{k.label}</span>
                                    <k.icon size={18} className="text-[var(--mf-accent)] opacity-80"/>
                                </div>
                                <div className="text-3xl font-black">{k.val}</div>
                            </div>
                        ))}
                    </div>

                    {/* Charts Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                        
                        {/* 1. Existing: Top Categories */}
                        <div className="bg-[var(--mf-card)] border border-[var(--mf-border)] p-6 rounded-2xl h-[350px] col-span-2">
                            <h3 className="text-lg font-bold mb-4">Top Categories</h3>
                            <ResponsiveContainer width="100%" height="90%">
                                <BarChart data={summary.top_categories} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="key" type="category" width={100} tick={{fill: 'var(--mf-text)', fontSize: 12}} />
                                    <Tooltip 
                                        contentStyle={{backgroundColor: 'var(--mf-card)', borderColor: 'var(--mf-border)', color: 'var(--mf-text)'}}
                                        itemStyle={{color: 'var(--mf-accent)'}}
                                    />
                                    <Bar dataKey="units" fill={currentStyle.palette[1]} radius={[0,4,4,0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* 2. Existing: Volume Trend */}
                        <div className="bg-[var(--mf-card)] border border-[var(--mf-border)] p-6 rounded-2xl h-[350px] col-span-2">
                            <h3 className="text-lg font-bold mb-4">Volume Trend (By Supplier)</h3>
                             <ResponsiveContainer width="100%" height="90%">
                                <AreaChart data={summary.top_suppliers}>
                                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
                                    <XAxis dataKey="key" tick={{fill: 'var(--mf-text)', fontSize: 10}} />
                                    <YAxis tick={{fill: 'var(--mf-text)'}}/>
                                    <Tooltip contentStyle={{backgroundColor: 'var(--mf-card)', borderColor: 'var(--mf-border)'}}/>
                                    <Area type="monotone" dataKey="units" stroke={currentStyle.accent} fill={currentStyle.accent} fillOpacity={0.2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>

                        {/* 3. New: Supplier Distribution (Donut) */}
                        <div className="bg-[var(--mf-card)] border border-[var(--mf-border)] p-6 rounded-2xl h-[350px] col-span-1">
                            <h3 className="text-lg font-bold mb-4">Supplier Share</h3>
                            <ResponsiveContainer width="100%" height="85%">
                                <PieChart>
                                    <Pie
                                        data={summary.top_suppliers}
                                        innerRadius={50}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="units"
                                        nameKey="key"
                                    >
                                        {summary.top_suppliers.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={currentStyle.palette[index % currentStyle.palette.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{backgroundColor: 'var(--mf-card)', borderColor: 'var(--mf-border)'}}/>
                                    <Legend wrapperStyle={{fontSize: '10px', paddingTop: '10px'}}/>
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        {/* 4. New: Top Customers (Horizontal Bar) */}
                        <div className="bg-[var(--mf-card)] border border-[var(--mf-border)] p-6 rounded-2xl h-[350px] col-span-1">
                            <h3 className="text-lg font-bold mb-4">Top Customers</h3>
                            <ResponsiveContainer width="100%" height="90%">
                                <BarChart data={summary.top_customers} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} horizontal={false}/>
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="key" type="category" width={60} tick={{fill: 'var(--mf-text)', fontSize: 10}} />
                                    <Tooltip cursor={{fill: 'transparent'}} contentStyle={{backgroundColor: 'var(--mf-card)', borderColor: 'var(--mf-border)'}}/>
                                    <Bar dataKey="units" fill={currentStyle.palette[2]} radius={[0,4,4,0]} barSize={20}/>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                         {/* 5. New: Top Models (Radial Bar) */}
                        <div className="bg-[var(--mf-card)] border border-[var(--mf-border)] p-6 rounded-2xl h-[350px] col-span-1">
                            <h3 className="text-lg font-bold mb-4">Top Models</h3>
                            <ResponsiveContainer width="100%" height="90%">
                                <RadialBarChart 
                                    innerRadius="10%" 
                                    outerRadius="90%" 
                                    data={summary.top_models} 
                                    startAngle={180} 
                                    endAngle={0}
                                >
                                    <RadialBar label={{ position: 'insideStart', fill: '#fff', fontSize: '10px' }} background dataKey="units">
                                        {summary.top_models.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={currentStyle.palette[index % currentStyle.palette.length]} />
                                        ))}
                                    </RadialBar>
                                    <Legend iconSize={10} wrapperStyle={{fontSize: '10px'}} layout="vertical" verticalAlign="middle" align="right" />
                                    <Tooltip contentStyle={{backgroundColor: 'var(--mf-card)', borderColor: 'var(--mf-border)'}}/>
                                </RadialBarChart>
                            </ResponsiveContainer>
                        </div>

                         {/* 6. New: Daily Order Frequency (Line) */}
                         <div className="bg-[var(--mf-card)] border border-[var(--mf-border)] p-6 rounded-2xl h-[350px] col-span-1">
                            <h3 className="text-lg font-bold mb-4">Daily Order Frequency</h3>
                            <ResponsiveContainer width="100%" height="90%">
                                <LineChart data={summary.daily_trend}>
                                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
                                    <XAxis dataKey="date" tick={{fill: 'var(--mf-text)', fontSize: 9}} angle={-45} textAnchor="end" height={60}/>
                                    <YAxis tick={{fill: 'var(--mf-text)', fontSize: 10}}/>
                                    <Tooltip contentStyle={{backgroundColor: 'var(--mf-card)', borderColor: 'var(--mf-border)'}}/>
                                    <Line type="step" dataKey="orders" stroke={currentStyle.palette[3]} strokeWidth={2} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                         {/* 7. New: License Usage (Bar) */}
                         <div className="bg-[var(--mf-card)] border border-[var(--mf-border)] p-6 rounded-2xl h-[350px] col-span-2">
                            <h3 className="text-lg font-bold mb-4">License Volume</h3>
                            <ResponsiveContainer width="100%" height="90%">
                                <BarChart data={summary.top_licenses}>
                                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} vertical={false}/>
                                    <XAxis dataKey="key" tick={{fill: 'var(--mf-text)', fontSize: 10}} interval={0} angle={-10} textAnchor="end"/>
                                    <YAxis tick={{fill: 'var(--mf-text)'}}/>
                                    <Tooltip contentStyle={{backgroundColor: 'var(--mf-card)', borderColor: 'var(--mf-border)'}}/>
                                    <Bar dataKey="units" fill={currentStyle.palette[4]} radius={[4,4,0,0]} barSize={40}>
                                        {summary.top_licenses.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={currentStyle.palette[index % currentStyle.palette.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                         {/* 8. New: Orders Scatter (Date vs Qty) */}
                         <div className="bg-[var(--mf-card)] border border-[var(--mf-border)] p-6 rounded-2xl h-[350px] col-span-2">
                            <h3 className="text-lg font-bold mb-4">Order Size Distribution</h3>
                            <ResponsiveContainer width="100%" height="90%">
                                <ScatterChart>
                                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
                                    <XAxis type="number" dataKey="x" name="Date" domain={['auto', 'auto']} 
                                        tickFormatter={(unix) => new Date(unix).toLocaleDateString()} 
                                        tick={{fill: 'var(--mf-text)', fontSize: 10}}
                                    />
                                    <YAxis type="number" dataKey="y" name="Qty" tick={{fill: 'var(--mf-text)'}}/>
                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{backgroundColor: 'var(--mf-card)', borderColor: 'var(--mf-border)'}}
                                        labelFormatter={(unix) => new Date(unix).toLocaleDateString()}
                                    />
                                    <Scatter name="Orders" data={summary.scatter_data} fill={currentStyle.accent}>
                                        {summary.scatter_data.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={currentStyle.palette[index % currentStyle.palette.length]} />
                                        ))}
                                    </Scatter>
                                </ScatterChart>
                            </ResponsiveContainer>
                        </div>

                    </div>
                </div>
            )}

            {activeTab === 'network' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold">Supply Chain Network</h2>
                        <span className="text-xs opacity-50 border border-[var(--mf-border)] px-2 py-1 rounded">D3.js Force Directed</span>
                    </div>
                    <NetworkGraph data={filteredData} style={currentStyle} maxNodes={filters.max_nodes} />
                </div>
            )}

            {activeTab === 'agents' && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center bg-[var(--mf-card)] p-6 rounded-2xl border border-[var(--mf-border)]">
                        <div>
                            <h2 className="text-xl font-bold mb-1">Agent Studio</h2>
                            <p className="text-sm opacity-60">Chain multiple AI agents to analyze current filtered data.</p>
                        </div>
                        <button onClick={runPipeline} disabled={isProcessingAI}
                            className="px-6 py-3 bg-[var(--mf-accent)] text-black font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition flex items-center gap-2">
                            {isProcessingAI ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"/> : <Bot size={18}/>}
                            Run Pipeline
                        </button>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                        {pipelineRuns.map(run => (
                            <div key={run.id} className="bg-[var(--mf-card)] border border-[var(--mf-border)] rounded-2xl overflow-hidden">
                                <div className="p-4 border-b border-[var(--mf-border)] flex justify-between items-center bg-[rgba(0,0,0,0.1)]">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-3 h-3 rounded-full ${run.status === 'completed' ? 'bg-green-500' : run.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`}/>
                                        <span className="font-mono text-xs opacity-70">Run ID: {run.id}</span>
                                    </div>
                                    <span className="text-xs opacity-50">{new Date(run.timestamp).toLocaleString()}</span>
                                </div>
                                <div className="p-6 space-y-6">
                                    {run.error && <div className="p-4 bg-red-900/20 text-red-200 rounded-lg text-sm">{run.error}</div>}
                                    {Object.entries(run.agentOutputs).map(([agentId, output]) => (
                                        <div key={agentId} className="space-y-2">
                                            <h4 className="text-sm font-bold text-[var(--mf-accent)] uppercase tracking-wider">{DEFAULT_AGENTS.find(a => a.id === agentId)?.name || agentId}</h4>
                                            <div className="bg-[rgba(0,0,0,0.2)] p-4 rounded-xl text-sm leading-relaxed whitespace-pre-wrap font-mono border border-[var(--mf-border)]">
                                                {output}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'data' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Input */}
                    <div className="lg:col-span-1 space-y-6">
                         <div className="bg-[var(--mf-card)] border border-[var(--mf-border)] rounded-2xl p-6 space-y-4">
                            <h2 className="text-xl font-bold flex items-center gap-2"><FileUp size={20}/> Import Data</h2>
                            
                            {/* Actions */}
                            <div className="space-y-3">
                                <button onClick={loadDefaultDataset} className="w-full py-2 bg-[rgba(255,255,255,0.05)] border border-[var(--mf-border)] rounded-lg text-sm font-medium hover:bg-[rgba(255,255,255,0.1)] transition flex items-center justify-center gap-2">
                                    <Database size={14}/> Reset to Default Dataset
                                </button>
                                
                                <div className="relative w-full py-2 border-2 border-dashed border-[var(--mf-border)] rounded-lg hover:border-[var(--mf-accent)] transition flex items-center justify-center cursor-pointer group">
                                    <input type="file" accept=".csv,.json,.txt" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer"/>
                                    <div className="flex items-center gap-2 text-sm opacity-60 group-hover:opacity-100">
                                        <Upload size={14}/> Upload CSV/JSON
                                    </div>
                                </div>
                            </div>

                            <hr className="border-[var(--mf-border)] opacity-50"/>

                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase opacity-50">Or Paste Data (CSV/JSON)</label>
                                <textarea 
                                    value={dataInput}
                                    onChange={(e) => setDataInput(e.target.value)}
                                    placeholder="Paste CSV or JSON content here..."
                                    className="w-full h-48 bg-[rgba(0,0,0,0.2)] border border-[var(--mf-border)] rounded-xl p-4 font-mono text-xs focus:ring-2 focus:ring-[var(--mf-accent)] outline-none"
                                />
                                <button 
                                    onClick={() => {
                                        const parsed = parseRawInput(dataInput);
                                        setRawData(parsed);
                                        alert(`Parsed ${parsed.length} rows successfully.`);
                                    }}
                                    className="w-full py-2 bg-[var(--mf-accent)] text-black font-bold rounded-lg hover:opacity-90 transition">
                                    Process Paste
                                </button>
                            </div>
                         </div>
                    </div>

                    {/* Right: Preview */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-[var(--mf-card)] border border-[var(--mf-border)] rounded-2xl p-6 min-h-[500px]">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold flex items-center gap-2"><List size={20}/> Data Preview</h2>
                                <div className="flex items-center gap-2">
                                    <label className="text-xs opacity-60">Limit Rows:</label>
                                    <select value={previewLimit} onChange={(e) => setPreviewLimit(Number(e.target.value))} className="bg-[rgba(0,0,0,0.2)] border border-[var(--mf-border)] rounded p-1 text-xs">
                                        <option value={10}>10</option>
                                        <option value={20}>20</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                        <option value={1000}>1000</option>
                                    </select>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left">
                                    <thead className="uppercase opacity-50 border-b border-[var(--mf-border)] bg-[rgba(0,0,0,0.1)]">
                                        <tr>
                                            <th className="py-2 px-3">Supplier</th>
                                            <th className="py-2 px-3">Date</th>
                                            <th className="py-2 px-3">Category</th>
                                            <th className="py-2 px-3">License</th>
                                            <th className="py-2 px-3">Model</th>
                                            <th className="py-2 px-3">SN</th>
                                            <th className="py-2 px-3 text-right">Qty</th>
                                        </tr>
                                    </thead>
                                    <tbody className="font-mono">
                                        {filteredData.slice(0, previewLimit).map((r, i) => (
                                            <tr key={i} className="border-b border-[var(--mf-border)] border-opacity-10 hover:bg-[rgba(255,255,255,0.02)] transition">
                                                <td className="py-2 px-3">{r.SupplierID}</td>
                                                <td className="py-2 px-3">{r.Deliverdate}</td>
                                                <td className="py-2 px-3 max-w-[150px] truncate" title={r.Category}>{r.Category}</td>
                                                <td className="py-2 px-3 max-w-[100px] truncate">{r.LicenseNo}</td>
                                                <td className="py-2 px-3">{r.Model}</td>
                                                <td className="py-2 px-3">{r.SerNo}</td>
                                                <td className="py-2 px-3 text-right text-[var(--mf-accent)]">{r.Number}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredData.length === 0 && (
                                    <div className="py-12 text-center opacity-40 italic">
                                        No data available or filtered out. Import data to see preview.
                                    </div>
                                )}
                                {filteredData.length > previewLimit && (
                                    <div className="py-4 text-center text-xs opacity-50">
                                        Showing {previewLimit} of {filteredData.length} records
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {activeTab === 'quality' && (
                <div className="bg-[var(--mf-card)] border border-[var(--mf-border)] rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <Info className="text-[var(--mf-accent)]"/>
                        <h2 className="text-xl font-bold">Data Quality Report</h2>
                    </div>
                    <div className="grid grid-cols-3 gap-6">
                         <div className="p-4 bg-[rgba(255,255,255,0.02)] rounded-xl border border-[var(--mf-border)]">
                             <div className="text-2xl font-black mb-1">{summary.rows}</div>
                             <div className="text-xs opacity-50 uppercase">Total Rows</div>
                         </div>
                         <div className="p-4 bg-[rgba(255,255,255,0.02)] rounded-xl border border-[var(--mf-border)]">
                             <div className="text-2xl font-black mb-1">{filteredData.filter(d => !d.parsedDate).length}</div>
                             <div className="text-xs opacity-50 uppercase text-red-400">Invalid Dates</div>
                         </div>
                         <div className="p-4 bg-[rgba(255,255,255,0.02)] rounded-xl border border-[var(--mf-border)]">
                             <div className="text-2xl font-black mb-1">{filteredData.filter(d => d.Number <= 0).length}</div>
                             <div className="text-xs opacity-50 uppercase text-yellow-400">Zero/Neg Quantities</div>
                         </div>
                    </div>
                </div>
            )}
        </div>
      </main>
    </div>
  );
}

export default App;
