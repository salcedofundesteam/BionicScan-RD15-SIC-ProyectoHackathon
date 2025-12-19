import React, { useState, useEffect, useRef } from 'react';
import { ScanFace, Database, Globe, Upload, ShieldAlert, Terminal, Loader2, UserPlus } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('analyze'); // analyze | database | web
  const [knownFaces, setKnownFaces] = useState([]);
  const [logs, setLogs] = useState([]);
  
  // Analyze State
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  // Database State
  const [dbName, setDbName] = useState("");
  const [dbImage, setDbImage] = useState(null);

  // OSINT State
  const [osintQuery, setOsintQuery] = useState("");
  const [osintResults, setOsintResults] = useState(null);
  const [isOsintSearching, setIsOsintSearching] = useState(false);

  const canvasRef = useRef(null);
  const logsEndRef = useRef(null);

  // --- LOGGING SYSTEM ---
  const addLog = (level, message) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => [...prev, { time, level, message }]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // --- MATRIX RAIN EFFECT ---
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const chars = '01·';
    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops = Array(columns).fill(1);

    const draw = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${fontSize}px "JetBrains Mono"`;

      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        
        // Glitch effect colors
        if (Math.random() > 0.98) {
          ctx.fillStyle = '#d8b4fe'; // White/Lilac
        } else {
          ctx.fillStyle = '#4c1d95'; // Dark Purple
        }

        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
      animationFrameId = requestAnimationFrame(draw);
    };
    draw();

    addLog('INFO', 'System kernel loaded.');
    addLog('INFO', 'Waiting for user input...');

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // --- ANALYZE LOGIC ---
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result);
        setAnalysisResult(null);
        addLog('INFO', `Image loaded into buffer: ${file.name}`);
      };
      reader.readAsDataURL(file);
    }
  };

  const resetAnalysis = () => {
    setSelectedImage(null);
    setSelectedFile(null);
    setAnalysisResult(null);
    addLog('INFO', 'Buffer cleared.');
  };

  const startAnalysis = async () => {
    if (!selectedFile) return;
    
    setIsAnalyzing(true);
    setAnalysisResult(null);
    addLog('INFO', 'Initializing DeepFace Pipeline...');
    addLog('INFO', 'Detecting facial landmarks...');

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch('http://localhost:8000/predict/', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();

      if (data.error) throw new Error(data.error);

      setAnalysisResult(data);
      
      if (data.identified_name !== "UNKNOWN_TARGET" && data.identified_name !== "Desconocido") {
        addLog('WARNING', `MATCH FOUND IN DB: ${data.identified_name}`);
        setOsintQuery(data.identified_name);
      } else {
        addLog('INFO', 'No match found in local database.');
      }

    } catch (error) {
      addLog('ERROR', `Analysis failed: ${error.message}`);
      setAnalysisResult({
        identified_name: "ERROR_CONEXION",
        confidence: "0.00%",
        system_log: "Check backend connection."
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- DATABASE LOGIC ---
  const handleDbImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setDbImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const addToDatabase = () => {
    if (!dbName || !dbImage) {
      alert('Please upload an image and enter a name.');
      return;
    }
    setKnownFaces(prev => [...prev, { name: dbName, image: dbImage }]);
    addLog('INFO', `New subject '${dbName}' encoded into vector DB.`);
    setDbName("");
    setDbImage(null);
  };

  // --- OSINT LOGIC ---
  const startOsint = async () => {
    if (!osintQuery) return;
    
    setIsOsintSearching(true);
    setOsintResults(null);
    addLog('INFO', `Starting Real OSINT Search for: ${osintQuery}...`);

    try {
      const response = await fetch('http://localhost:8000/osint/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: osintQuery })
      });
      
      const data = await response.json();
      
      if (data.error) throw new Error(data.error);

      setOsintResults(data);
      addLog('INFO', `OSINT Search completed. Found: ${data.found}`);

    } catch (error) {
      addLog('ERROR', `OSINT failed: ${error.message}`);
      setOsintResults({
        found: false,
        summary: "Error connecting to OSINT module.",
        links: []
      });
    } finally {
      setIsOsintSearching(false);
    }
  };

  

  return (
    <div className="relative w-full h-screen flex flex-col bg-black text-slate-200 overflow-hidden font-mono">
      
      {/* Matrix Background */}
      <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full z-0 opacity-40 pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,black_100%)] pointer-events-none z-0"></div>

      {/* Main Container */}
      <div className="relative z-10 flex-1 flex flex-col items-center p-4 md:p-8 overflow-y-auto custom-scrollbar pb-44 md:pb-8">
        
        {/* HEADER */}
        <div className="text-center mb-8 relative animate-fade-in">
            <div className="inline-block mb-3 px-3 py-1 border border-purple-500/30 rounded-full bg-purple-900/10 backdrop-blur-sm">
                <span className="text-[10px] tracking-[0.2em] text-purple-400 uppercase flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                    </span>
                    BIONIC SCAN API v2.0
                </span>
            </div>
            <h1 className="text-4xl md:text-6xl font-light tracking-tighter text-white">
                BIONIC<span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">SCAN</span>
            </h1>
        </div>

        {/* NAVIGATION */}
        <div className="flex flex-wrap justify-center gap-6 mb-8 w-full max-w-5xl">
            <NavButton 
              active={activeTab === 'analyze'} 
              onClick={() => setActiveTab('analyze')} 
              icon={<ScanFace />} 
              label="Escanear" 
            />
            <NavButton 
              active={activeTab === 'database'} 
              onClick={() => setActiveTab('database')} 
              icon={<Database />} 
              label="Base Datos" 
            />
            <NavButton 
              active={activeTab === 'web'} 
              onClick={() => setActiveTab('web')} 
              icon={<Globe />} 
              label="OSINT" 
            />
        </div>

        {/* MAIN PANEL */}
        <div className="w-full max-w-4xl relative group mb-8 transition-all duration-500">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl opacity-20 blur transition duration-500 group-hover:opacity-40"></div>
            
            <div className="relative w-full bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-8 min-h-[450px]">
                
                {/* SECTION: ANALYZE */}
                {activeTab === 'analyze' && (
                  <div className="animate-fade-in">
                    <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-6">
                        <h2 className="text-xl text-white font-light">Escaneo Facial (DeepFace)</h2>
                        <span className="text-xs text-purple-400 flex items-center gap-2">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                            BACKEND: ONLINE
                        </span>
                    </div>

                    {!selectedImage ? (
                      <div 
                        onClick={() => document.getElementById('file-input').click()}
                        className="border-2 border-dashed border-white/10 hover:border-purple-500/50 rounded-xl p-12 flex flex-col items-center cursor-pointer transition-all bg-white/5 group"
                      >
                          <input type="file" id="file-input" className="hidden" accept="image/*" onChange={handleImageUpload} />
                          <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110">
                              <Upload className="text-purple-400 w-8 h-8" />
                          </div>
                          <p className="text-sm tracking-widest text-slate-400 group-hover:text-white transition-colors">CARGAR IMAGEN OBJETIVO</p>
                          <p className="text-xs text-slate-600 mt-2">JPG, PNG, WEBP</p>
                      </div>
                    ) : (
                      <div className="flex flex-col md:flex-row gap-6">
                          <div className="w-full md:w-1/3 relative rounded-lg overflow-hidden border border-purple-500/30 bg-black h-64">
                              <img src={selectedImage} className="w-full h-full object-contain" alt="Target" />
                              {isAnalyzing && (
                                  <div className="absolute inset-0 bg-purple-500/20 z-10 flex items-center justify-center">
                                      <div className="absolute top-0 w-full h-1 bg-purple-400 animate-scan shadow-[0_0_10px_#c084fc]"></div>
                                      <span className="bg-black/70 text-purple-300 px-2 py-1 text-xs rounded">PROCESANDO...</span>
                                  </div>
                              )}
                          </div>
                          
                          <div className="flex-1 flex flex-col gap-4">
                              <div>
                                  <button 
                                    onClick={startAnalysis} 
                                    disabled={isAnalyzing}
                                    className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold tracking-widest rounded flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(168,85,247,0.4)] hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                      <ScanFace /> {isAnalyzing ? 'ANALIZANDO...' : 'INICIAR ANÁLISIS'}
                                  </button>
                                  <button onClick={resetAnalysis} className="w-full mt-2 text-xs text-slate-500 hover:text-white">CANCELAR / NUEVA IMAGEN</button>
                              </div>

                              {analysisResult && (
                                <div className="space-y-4 animate-fade-in">
                                    <div className={`p-4 rounded border-l-4 ${analysisResult.identified_name !== "UNKNOWN_TARGET" ? "border-red-500 bg-red-900/10" : "border-yellow-500 bg-yellow-900/10"}`}>
                                        <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Identificación</p>
                                        <p className="text-2xl font-bold text-white">{analysisResult.identified_name}</p>
                                    </div>
                                    
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        <div className="bg-white/5 p-2 rounded border border-white/5">
                                            <p className="text-[10px] text-slate-500">CONFIDENCE</p>
                                            <p className="text-white">{analysisResult.confidence}</p>
                                        </div>
                                        <div className="bg-white/5 p-2 rounded border border-white/5">
                                            <p className="text-[10px] text-slate-500">STATUS</p>
                                            <p className="text-white">ACTIVE</p>
                                        </div>
                                        <div className="bg-white/5 p-2 rounded border border-white/5">
                                            <p className="text-[10px] text-slate-500">MODE</p>
                                            <p className="text-white uppercase">DEEPFACE</p>
                                        </div>
                                    </div>

                                    <div className="text-xs text-purple-300 bg-black/40 p-3 rounded border border-white/5 break-all">
                                        >>> SYSTEM_LOG: {analysisResult.system_log || "Analysis complete."}
                                    </div>

                                    {analysisResult.identified_name !== "UNKNOWN_TARGET" && (
                                        <button 
                                          onClick={() => { setOsintQuery(analysisResult.identified_name); setActiveTab('web'); }}
                                          className="w-full py-2 border border-purple-500/50 text-purple-300 hover:bg-purple-900/20 text-xs tracking-widest uppercase rounded flex items-center justify-center gap-2 transition-colors"
                                        >
                                            <Globe size={14} /> INVESTIGAR EN OSINT
                                        </button>
                                    )}
                                </div>
                              )}
                          </div>
                      </div>
                    )}
                  </div>
                )}

                {/* SECTION: DATABASE */}
                {activeTab === 'database' && (
                  <div className="animate-fade-in">
                    <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-6">
                        <h2 className="text-xl text-white font-light">Base de Datos (Known Faces)</h2>
                        <span className="text-xs text-emerald-400">{knownFaces.length} FILES LOADED</span>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 mb-8 items-end bg-white/5 p-4 rounded-xl border border-white/5">
                        <div 
                          onClick={() => document.getElementById('db-file-input').click()}
                          className="w-20 h-20 bg-black border border-dashed border-slate-600 rounded-lg flex items-center justify-center cursor-pointer hover:border-purple-400 overflow-hidden shrink-0 transition-colors relative"
                        >
                             {dbImage ? (
                               <img src={dbImage} className="w-full h-full object-cover" alt="Preview" />
                             ) : (
                               <UserPlus className="text-slate-600" />
                             )}
                             <input type="file" id="db-file-input" className="hidden" accept="image/*" onChange={handleDbImageUpload} />
                        </div>
                        <div className="flex-1 w-full">
                            <label className="text-[10px] uppercase text-slate-500 tracking-widest block mb-1">Nombre del Sujeto</label>
                            <input 
                              type="text" 
                              value={dbName}
                              onChange={(e) => setDbName(e.target.value)}
                              placeholder="Ej: John Doe" 
                              className="w-full bg-black border-b border-purple-500/50 text-white py-2 focus:outline-none focus:border-purple-400 transition-colors"
                            />
                        </div>
                        <button 
                          onClick={addToDatabase}
                          className="w-full md:w-auto px-6 py-2 bg-emerald-600/20 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded uppercase text-xs tracking-widest font-bold transition-all shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                        >
                            Guardar
                        </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
                        {knownFaces.length === 0 ? (
                          <div className="col-span-2 md:col-span-4 text-center py-10 text-slate-600 text-xs">
                              DATABASE EMPTY. UPLOAD KNOWN FACES.
                          </div>
                        ) : (
                          knownFaces.map((face, idx) => (
                            <div key={idx} className="bg-black/40 border border-white/10 rounded-lg p-2 flex items-center gap-3 animate-fade-in">
                                <img src={face.image} className="w-10 h-10 rounded-full object-cover border border-purple-500/30" alt={face.name} />
                                <span className="text-xs text-slate-300 truncate">{face.name}</span>
                            </div>
                          ))
                        )}
                    </div>
                  </div>
                )}

                {/* SECTION: OSINT */}
                {activeTab === 'web' && (
                  <div className="animate-fade-in">
                    <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-6">
                        <h2 className="text-xl text-white font-light">OSINT Scraper (Simulación)</h2>
                        <ShieldAlert className="text-red-400" />
                    </div>

                    <div className="flex gap-0 mb-6 shadow-[0_0_20px_rgba(147,51,234,0.15)]">
                        <input 
                          type="text" 
                          value={osintQuery}
                          onChange={(e) => setOsintQuery(e.target.value)}
                          placeholder="Objetivo (Nombre, Alias...)" 
                          className="flex-1 bg-black/50 border border-white/10 border-r-0 rounded-l p-4 text-white focus:outline-none focus:border-purple-500 transition-colors"
                        />
                        <button 
                          onClick={startOsint}
                          disabled={isOsintSearching}
                          className="bg-purple-600 px-6 rounded-r font-bold text-white uppercase tracking-widest hover:bg-purple-500 transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                             {isOsintSearching ? 'BUSCANDO...' : 'BUSCAR'}
                        </button>
                    </div>

                    <div className="flex-1 bg-black/50 border border-white/5 rounded-xl p-4 text-xs overflow-y-auto custom-scrollbar h-[250px]">
                        {!osintResults && !isOsintSearching && (
                          <div className="h-full flex flex-col items-center justify-center text-slate-600">
                              <Globe className="w-12 h-12 mb-4 opacity-20" />
                              <p>ESPERANDO OBJETIVO PARA INICIAR DRIVER...</p>
                          </div>
                        )}
                        
                        {isOsintSearching && (
                          <div className="h-full flex flex-col items-center justify-center text-slate-600">
                              <Loader2 className="w-8 h-8 mb-4 animate-spin text-purple-500" />
                              <p>SCRAPING EN PROGRESO...</p>
                          </div>
                        )}

                        {osintResults && (
                          <div className="space-y-4 animate-fade-in">
                              <p className="text-emerald-400 border-b border-white/5 pb-2">>>> RESULTADOS ENCONTRADOS</p>
                              <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">
                                  {osintResults.summary}
                              </p>
                              <div className="space-y-2 mt-4">
                                  {osintResults.links.map((link, i) => (
                                    <a key={i} href="#" className="block text-blue-400 hover:underline truncate hover:text-blue-300 transition-colors">
                                      [{i+1}] {link}
                                    </a>
                                  ))}
                              </div>
                          </div>
                        )}
                    </div>
                  </div>
                )}

            </div>

            {/* TERMINAL LOGS (Responsive: Fixed on Mobile, Static on Desktop) */}
            <div className="w-full md:max-w-4xl bg-black border-t md:border border-white/10 h-40 overflow-hidden flex flex-col text-[10px] p-2 opacity-90 z-20 shadow-[0_-5px_20px_rgba(0,0,0,0.8)] fixed bottom-0 left-0 md:relative md:rounded-xl md:mt-8 md:shadow-none">
                <div className="text-purple-500 mb-1 flex items-center gap-2 border-b border-white/5 pb-1">
                    <Terminal size={12} /> SYSTEM_OUTPUT_STREAM
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 p-1">
                    {logs.map((log, i) => (
                      <div key={i} className="flex gap-2 hover:bg-white/5 px-1 rounded">
                          <span className="text-slate-500 select-none">{log.time}</span>
                          <span className={`font-bold ${log.level === 'INFO' ? 'text-blue-400' : log.level === 'WARNING' ? 'text-yellow-400' : 'text-red-500'}`}>
                            [{log.level}]
                          </span>
                          <span className="text-slate-300 break-all">{log.message}</span>
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                </div>
            </div>

        </div>

      </div>

    </div>
  );
}

function NavButton({ active, onClick, icon, label }) {
  return (
    <button 
      onClick={onClick} 
      className={`group flex flex-col items-center gap-2 px-4 py-2 transition-all duration-300 
        ${active ? 'opacity-100 scale-105' : 'opacity-60 hover:opacity-100'}`}
    >
        <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-125 
          ${active 
            ? 'border border-purple-400 bg-purple-500/20 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]' 
            : 'border border-slate-700 text-slate-400 bg-black group-hover:border-purple-400 group-hover:text-white group-hover:bg-purple-500/10 group-hover:shadow-[0_0_15px_rgba(168,85,247,0.4)]'}`}
        >
            {icon}
        </div>
        <span className={`text-[10px] tracking-widest uppercase group-hover:text-purple-300 transition-colors 
          ${active ? 'text-white' : 'text-slate-500'}`}
        >
          {label}
        </span>
    </button>
  );
}
