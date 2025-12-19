import React, { useState, useEffect, useRef } from 'react';
import { Scan, Upload, Shield, Globe, Terminal, Activity, AlertTriangle, Cpu, Zap, Search } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('predict'); // predict | osint
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [logs, setLogs] = useState([]);
  
  // Estado para OSINT (Búsqueda manual)
  const [osintQuery, setOsintQuery] = useState("");

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const logsEndRef = useRef(null);

  // ---  Add Log ---
  const addLog = (level, message) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => [...prev, { time: timestamp, level, message }]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // --- Matrix Rain Effect (Fondo) ---
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

    const columns = Math.floor(canvas.width / 20);
    const drops = Array(columns).fill(1);

    const draw = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0f0'; // Hacker Green
      ctx.font = '15px monospace';

      for (let i = 0; i < drops.length; i++) {
        const text = String.fromCharCode(0x30A0 + Math.random() * 96);
        ctx.fillText(text, i * 20, drops[i] * 20);
        if (drops[i] * 20 > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
      animationFrameId = requestAnimationFrame(draw);
    };
    draw();

    // Logs iniciales
    addLog('SYSTEM', 'CPU NODE INITIALIZED');
    addLog('INFO', 'TENSORFLOW LITE MODE: ACTIVE');
    addLog('INFO', 'Waiting for input...');

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // --- Manejo de Archivos ---
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result);
        setPrediction(null);
        addLog('INPUT', `Imagen cargada: ${file.name} (${(file.size/1024).toFixed(1)} KB)`);
      };
      reader.readAsDataURL(file);
    }
  };

  // ---  Conexion con Backend  ---
  const triggerPrediction = async () => {
    if (!selectedFile) return;
    setIsAnalyzing(true);
    setPrediction(null);
    addLog('PROCESS', 'Normalizando imagen (224x224)...');
    addLog('NET', 'Enviando a http://127.0.0.1:8000/predict/ ...');

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      // LLAMADA AL BACKEND
      const response = await fetch('http://127.0.0.1:8000/predict/', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Procesar respuesta
      addLog('SUCCESS', `Inferencia completada.`);
      addLog('RESULT', `Sujeto: ${data.identified_name} | Conf: ${data.confidence}`);

      setPrediction(data);
      
      // Si se identifica a alguien, preparar OSINT
      if (data.identified_name !== "UNKNOWN_TARGET" && data.identified_name !== "Desconocido") {
          setOsintQuery(data.identified_name);
      }

    } catch (error) {
      addLog('ERROR', `Fallo en predicción: ${error.message}`);
      setPrediction({
          identified_name: "ERROR_CONEXION",
          confidence: "0.00%",
          system_log: "Verifica que python main.py esté corriendo"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleOsintSearch = () => {
      if(!osintQuery) return;
      addLog('OSINT', `Abriendo búsqueda externa para: ${osintQuery}`);
      window.open(`https://www.google.com/search?q="${osintQuery}" site:linkedin.com OR site:twitter.com OR site:facebook.com`, '_blank');
  };

  return (
    <div className="relative w-full min-h-screen bg-black overflow-hidden font-mono text-green-500 selection:bg-green-500/30 flex flex-col">
      
      {/* fonfo Matrix */}
      <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none" />
      
      {/* Container Principal */}
      <div className="relative z-10 container mx-auto p-4 md:p-8 flex flex-col items-center max-w-5xl h-screen">
        
        {/* Header */}
        <div className="w-full flex justify-between items-end border-b border-green-800 pb-4 mb-6">
            <div>
                <h1 className="text-4xl font-bold tracking-tighter text-white">NEURAL<span className="text-green-500">SCAN</span></h1>
                <p className="text-xs text-green-700 mt-1">CPU INFERENCE ARCHITECTURE v3.0</p>
            </div>
            <div className="flex gap-4">
                 <NavButton active={activeTab === 'predict'} onClick={() => setActiveTab('predict')} icon={<Cpu size={18}/>} label="NEURAL NET" />
                 <NavButton active={activeTab === 'osint'} onClick={() => setActiveTab('osint')} icon={<Globe size={18}/>} label="OSINT TOOLS" />
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 w-full flex flex-col md:flex-row gap-6 overflow-hidden">
            
            {/* LEFT COLUMN: Main Interface */}
            <div className="flex-1 flex flex-col gap-4">
                
                {activeTab === 'predict' && (
                    <div className="bg-black/50 border border-green-900/50 rounded-lg p-6 flex flex-col items-center justify-center flex-1 relative backdrop-blur-sm">
                        
                        {!selectedImage ? (
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-green-900 hover:border-green-500 transition-colors rounded-xl p-12 cursor-pointer flex flex-col items-center gap-4 group"
                            >
                                <Upload className="w-16 h-16 text-green-900 group-hover:text-green-500 transition-colors" />
                                <p className="text-sm tracking-widest text-green-700 group-hover:text-green-400">CARGAR IMAGEN OBJETIVO</p>
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col">
                                <div className="relative flex-1 rounded-lg overflow-hidden border border-green-800 bg-black">
                                    <img src={selectedImage} className="w-full h-full object-contain" alt="Target" />
                                    
                                    {/* Overlay de escaneo */}
                                    {isAnalyzing && (
                                        <div className="absolute inset-0 bg-green-500/10 z-10 flex flex-col items-center justify-center">
                                            <div className="w-full h-1 bg-green-400 animate-[scan_2s_infinite] shadow-[0_0_15px_#4ade80]" />
                                            <div className="mt-4 bg-black/80 px-4 py-2 text-xs border border-green-500 animate-pulse">
                                                PROCESSING TENSORS...
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Botón de acción */}
                                {!prediction && (
                                    <button 
                                        onClick={triggerPrediction} 
                                        disabled={isAnalyzing}
                                        className="mt-4 w-full py-4 bg-green-900/30 border border-green-600 hover:bg-green-600 hover:text-black transition-all font-bold tracking-[0.2em] flex items-center justify-center gap-2"
                                    >
                                        {isAnalyzing ? <Activity className="animate-spin" /> : <Scan />}
                                        {isAnalyzing ? 'EJECUTANDO MODELO...' : 'INICIAR INFERENCIA'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'osint' && (
                    <div className="bg-black/50 border border-green-900/50 rounded-lg p-6 flex-1 relative backdrop-blur-sm flex flex-col justify-center">
                        <div className="mb-8 text-center">
                             <Shield className="w-16 h-16 text-green-700 mx-auto mb-4" />
                             <h2 className="text-2xl text-white">OSINT MANUAL GATEWAY</h2>
                             <p className="text-green-700 text-sm mt-2">Búsqueda externa mediante Google Dorks</p>
                        </div>
                        
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={osintQuery}
                                onChange={(e) => setOsintQuery(e.target.value)}
                                placeholder="Nombre del objetivo, Alias, Teléfono..."
                                className="flex-1 bg-black border border-green-800 p-4 text-white focus:outline-none focus:border-green-400 font-mono"
                            />
                            <button 
                                onClick={handleOsintSearch}
                                className="bg-green-700 hover:bg-green-600 text-black px-6 font-bold flex items-center gap-2"
                            >
                                <Search size={20} />
                            </button>
                        </div>
                        <div className="mt-4 text-xs text-gray-500 font-mono">
                            * Redirige a búsqueda segura en navegador externo para evitar bloqueos de IP.
                        </div>
                    </div>
                )}

            </div>

            {/* RIGHT COLUMN: Results & Logs */}
            <div className="w-full md:w-80 flex flex-col gap-4">
                
                {/* Prediciones de Resultado Card */}
                <div className={`
                    border rounded-lg p-4 transition-all duration-500
                    ${prediction 
                        ? 'border-green-500 bg-green-900/20 opacity-100 translate-x-0' 
                        : 'border-green-900/30 bg-black/40 opacity-50'
                    }
                `}>
                    <h3 className="text-xs uppercase tracking-widest text-green-600 mb-2 border-b border-green-900 pb-2">Analysis Result</h3>
                    
                    {prediction ? (
                        <div className="space-y-4">
                            <div>
                                <p className="text-[10px] text-gray-400 uppercase">Identidad Detectada</p>
                                <p className={`text-2xl font-bold truncate ${prediction.identified_name === "UNKNOWN_TARGET" ? 'text-red-500' : 'text-white'}`}>
                                    {prediction.identified_name}
                                </p>
                            </div>
                            
                            <div>
                                <div className="flex justify-between text-[10px] mb-1">
                                    <span>CONFIDENCE LEVEL</span>
                                    <span className="text-white">{prediction.confidence}</span>
                                </div>
                                <div className="w-full h-2 bg-green-900/50 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-green-500 shadow-[0_0_10px_#22c55e]" 
                                        style={{width: prediction.confidence}}
                                    ></div>
                                </div>
                            </div>

                            <div className="p-2 bg-black/60 border border-green-900/50 text-[10px] font-mono text-green-300 break-all">
                                {prediction.system_log || "No additional data."}
                            </div>

                            {prediction.identified_name !== "UNKNOWN_TARGET" && (
                                <button 
                                    onClick={() => setActiveTab('osint')}
                                    className="w-full py-2 border border-green-500/30 text-green-400 hover:bg-green-500/10 text-xs uppercase"
                                >
                                    Investigar Objetivo →
                                </button>
                            )}

                            <button onClick={() => {setPrediction(null); setSelectedImage(null);}} className="text-xs text-gray-500 hover:text-white underline w-full text-center">
                                NUEVA CONSULTA
                            </button>
                        </div>
                    ) : (
                        <div className="h-32 flex items-center justify-center text-xs text-green-800 text-center px-4">
                            ESPERANDO RESPUESTA DEL NODO DE INFERENCIA...
                        </div>
                    )}
                </div>

                {/* Syste Logs */}
                <div className="flex-1 bg-black border border-green-900/50 p-2 font-mono text-[10px] overflow-hidden flex flex-col min-h-[200px]">
                    <div className="flex items-center gap-2 text-green-600 border-b border-green-900/30 pb-1 mb-1">
                        <Terminal size={10} /> SYSTEM_OUTPUT
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar pr-1 opacity-80">
                        {logs.map((log, i) => (
                            <div key={i} className="flex gap-2">
                                <span className="text-gray-600">[{log.time}]</span>
                                <span className={log.level === 'ERROR' ? 'text-red-500' : 'text-green-400'}>{log.level}:</span>
                                <span className="text-gray-300">{log.message}</span>
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                </div>

            </div>
        </div>
      </div>
    </div>
  );
}

// Componente auxiliar de botón
function NavButton({ active, onClick, icon, label }) {
    return (
        <button 
            onClick={onClick}
            className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-bold transition-all
            ${active 
                ? 'bg-green-600 text-black shadow-[0_0_15px_rgba(34,197,94,0.4)]' 
                : 'bg-black border border-green-900 text-green-700 hover:border-green-500 hover:text-green-500'
            }`}
        >
            {icon}
            <span className="hidden md:inline">{label}</span>
        </button>
    );
}