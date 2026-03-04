/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Trophy, MessageSquare, Send, Shield, Zap, ChevronRight, Play } from 'lucide-react';

// --- Types ---
interface Player {
  id: string;
  name: string;
  team: 'red' | 'blue';
  x: number;
  y: number;
  color: string;
}

interface ChatMessage {
  id: string;
  sender: string;
  team: 'red' | 'blue';
  text: string;
}

// --- Constants ---
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PLAYER_SIZE = 30;
const GRAVITY = 0.5;
const JUMP_FORCE = -12;
const SPEED = 5;

const PLATFORMS = [
  { x: 0, y: 550, w: 200, h: 50 }, // Start
  { x: 250, y: 450, w: 150, h: 20 },
  { x: 450, y: 350, w: 150, h: 20 },
  { x: 200, y: 250, w: 150, h: 20 },
  { x: 400, y: 150, w: 150, h: 20 },
  { x: 650, y: 100, w: 150, h: 500 }, // Finish Zone
];

const OBSTACLES = [
  { x: 300, y: 430, w: 30, h: 20, type: 'spike' },
  { x: 250, y: 230, w: 30, h: 20, type: 'spike' },
];

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<'lobby' | 'playing' | 'won'>('lobby');
  const [playerName, setPlayerName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<'red' | 'blue' | null>(null);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [myId, setMyId] = useState<string>('');
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const [winner, setWinner] = useState<{ team: string; name: string } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef({ x: 50, y: 300, vx: 0, vy: 0, onGround: false });
  const keys = useRef<Record<string, boolean>>({});

  // Initialize Socket
  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('init', ({ id, players }) => {
      setMyId(id);
      setPlayers(players);
    });

    newSocket.on('playerJoined', (player) => {
      setPlayers((prev) => ({ ...prev, [player.id]: player }));
    });

    newSocket.on('playerMoved', ({ id, x, y }) => {
      setPlayers((prev) => {
        if (!prev[id]) return prev;
        return { ...prev, [id]: { ...prev[id], x, y } };
      });
    });

    newSocket.on('playerLeft', (id) => {
      setPlayers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    newSocket.on('chatMessage', (msg) => {
      setChat((prev) => [...prev.slice(-10), msg]);
    });

    newSocket.on('gameWon', (data) => {
      setWinner(data);
      setGameState('won');
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Game Loop
  useEffect(() => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const update = () => {
      const p = playerRef.current;

      // Horizontal movement
      if (keys.current['ArrowLeft'] || keys.current['a']) p.vx = -SPEED;
      else if (keys.current['ArrowRight'] || keys.current['d']) p.vx = SPEED;
      else p.vx *= 0.8;

      // Jump
      if ((keys.current['ArrowUp'] || keys.current['w'] || keys.current[' ']) && p.onGround) {
        p.vy = JUMP_FORCE;
        p.onGround = false;
      }

      // Gravity
      p.vy += GRAVITY;
      p.x += p.vx;
      p.y += p.vy;

      // Floor collision
      if (p.y > CANVAS_HEIGHT) {
        p.x = 50;
        p.y = 300;
        p.vy = 0;
      }

      // Platform collisions
      p.onGround = false;
      PLATFORMS.forEach((plat) => {
        if (
          p.x < plat.x + plat.w &&
          p.x + PLAYER_SIZE > plat.x &&
          p.y + PLAYER_SIZE > plat.y &&
          p.y + PLAYER_SIZE < plat.y + plat.h + 10 &&
          p.vy >= 0
        ) {
          p.y = plat.y - PLAYER_SIZE;
          p.vy = 0;
          p.onGround = true;
        }
      });

      // Obstacle collisions
      OBSTACLES.forEach((obs) => {
        if (
          p.x < obs.x + obs.w &&
          p.x + PLAYER_SIZE > obs.x &&
          p.y < obs.y + obs.h &&
          p.y + PLAYER_SIZE > obs.y
        ) {
          p.x = 50;
          p.y = 300;
          p.vy = 0;
        }
      });

      // Win condition
      if (p.x > 700 && gameState === 'playing') {
        socket?.emit('win', players[myId]?.team);
      }

      // Sync with server (throttled would be better, but simple for now)
      socket?.emit('move', { x: p.x, y: p.y });
    };

    const draw = () => {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw Background
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw Platforms
      ctx.fillStyle = '#cbd5e1';
      PLATFORMS.forEach((plat) => {
        ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
        ctx.strokeStyle = '#94a3b8';
        ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);
      });

      // Draw Obstacles
      ctx.fillStyle = '#ef4444';
      OBSTACLES.forEach((obs) => {
        ctx.beginPath();
        ctx.moveTo(obs.x, obs.y + obs.h);
        ctx.lineTo(obs.x + obs.w / 2, obs.y);
        ctx.lineTo(obs.x + obs.w, obs.y + obs.h);
        ctx.fill();
      });

      // Draw Finish Zone
      ctx.fillStyle = '#22c55e33';
      ctx.fillRect(700, 0, 100, CANVAS_HEIGHT);
      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 16px Inter';
      ctx.fillText('FINISH', 720, 50);

      // Draw Other Players
      (Object.values(players) as Player[]).forEach((p) => {
        if (p.id === myId) return;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, PLAYER_SIZE, PLAYER_SIZE);
        ctx.fillStyle = '#000';
        ctx.font = '10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(p.name, p.x + PLAYER_SIZE / 2, p.y - 5);
      });

      // Draw Me
      const me = players[myId];
      if (me) {
        ctx.fillStyle = me.color;
        ctx.fillRect(playerRef.current.x, playerRef.current.y, PLAYER_SIZE, PLAYER_SIZE);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeRect(playerRef.current.x, playerRef.current.y, PLAYER_SIZE, PLAYER_SIZE);
        ctx.fillStyle = '#000';
        ctx.font = 'bold 12px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('YOU', playerRef.current.x + PLAYER_SIZE / 2, playerRef.current.y - 5);
      }
    };

    const loop = () => {
      update();
      draw();
      animationId = requestAnimationFrame(loop);
    };

    loop();

    const handleKeyDown = (e: KeyboardEvent) => (keys.current[e.key] = true);
    const handleKeyUp = (e: KeyboardEvent) => (keys.current[e.key] = false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState, players, myId, socket]);

  const handleJoin = () => {
    if (!playerName || !selectedTeam) return;
    socket?.emit('join', { name: playerName, team: selectedTeam });
    setGameState('playing');
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    socket?.emit('chat', message);
    setMessage('');
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] font-sans text-[#141414] overflow-hidden flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-[#141414] flex items-center justify-between px-6 bg-white z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#141414] rounded-lg flex items-center justify-center text-white">
            <Zap size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight uppercase italic font-serif">Team Obby Quest</h1>
        </div>
        
        {gameState === 'playing' && (
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Shield className="text-red-500" size={18} />
              <span className="font-mono text-sm font-bold">{(Object.values(players) as Player[]).filter(p => p.team === 'red').length}</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="text-blue-500" size={18} />
              <span className="font-mono text-sm font-bold">{(Object.values(players) as Player[]).filter(p => p.team === 'blue').length}</span>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 relative flex items-center justify-center p-4">
        <AnimatePresence mode="wait">
          {gameState === 'lobby' && (
            <motion.div
              key="lobby"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white border-2 border-[#141414] p-8 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]"
            >
              <h2 className="text-3xl font-black mb-6 italic font-serif uppercase">Join the Quest</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest mb-2 opacity-50">Your Name</label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Enter nickname..."
                    className="w-full p-4 border-2 border-[#141414] font-mono focus:outline-none focus:bg-yellow-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest mb-2 opacity-50">Select Team</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setSelectedTeam('red')}
                      className={`p-4 border-2 border-[#141414] font-bold uppercase flex items-center justify-center gap-2 transition-all ${
                        selectedTeam === 'red' ? 'bg-red-500 text-white shadow-inner' : 'bg-white hover:bg-red-50'
                      }`}
                    >
                      <Shield size={20} /> Red
                    </button>
                    <button
                      onClick={() => setSelectedTeam('blue')}
                      className={`p-4 border-2 border-[#141414] font-bold uppercase flex items-center justify-center gap-2 transition-all ${
                        selectedTeam === 'blue' ? 'bg-blue-500 text-white shadow-inner' : 'bg-white hover:bg-blue-50'
                      }`}
                    >
                      <Shield size={20} /> Blue
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleJoin}
                  disabled={!playerName || !selectedTeam}
                  className="w-full py-4 bg-[#141414] text-white font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-30 hover:bg-emerald-500 transition-colors"
                >
                  Start Game <ChevronRight size={20} />
                </button>
              </div>
            </motion.div>
          )}

          {gameState === 'playing' && (
            <motion.div
              key="game"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="relative w-full max-w-[800px] aspect-[4/3] bg-white border-4 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] overflow-hidden"
            >
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                className="w-full h-full cursor-none"
              />

              {/* Chat Overlay */}
              <div className="absolute bottom-4 left-4 w-64 flex flex-col gap-2">
                <div className="bg-white/90 border-2 border-[#141414] p-2 h-40 overflow-y-auto font-mono text-xs space-y-1">
                  {chat.map((msg) => (
                    <div key={msg.id} className="flex gap-1">
                      <span className={`font-bold ${msg.team === 'red' ? 'text-red-600' : 'text-blue-600'}`}>
                        [{msg.sender}]:
                      </span>
                      <span className="break-words">{msg.text}</span>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Chat..."
                    className="flex-1 border-2 border-[#141414] px-2 py-1 text-xs font-mono focus:outline-none"
                  />
                  <button type="submit" className="bg-[#141414] text-white p-1">
                    <Send size={14} />
                  </button>
                </form>
              </div>

              {/* Controls Hint */}
              <div className="absolute top-4 right-4 bg-white/90 border-2 border-[#141414] p-2 font-mono text-[10px] uppercase tracking-tighter hidden md:block">
                WASD to Move | SPACE to Jump
              </div>

              {/* Mobile Controls */}
              <div className="absolute bottom-4 right-4 flex gap-4 md:hidden">
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onPointerDown={() => keys.current['a'] = true}
                    onPointerUp={() => keys.current['a'] = false}
                    className="w-12 h-12 bg-white/80 border-2 border-[#141414] flex items-center justify-center active:bg-gray-200"
                  >
                    ←
                  </button>
                  <button 
                    onPointerDown={() => keys.current['d'] = true}
                    onPointerUp={() => keys.current['d'] = false}
                    className="w-12 h-12 bg-white/80 border-2 border-[#141414] flex items-center justify-center active:bg-gray-200"
                  >
                    →
                  </button>
                </div>
                <button 
                  onPointerDown={() => keys.current[' ' ] = true}
                  onPointerUp={() => keys.current[' ' ] = false}
                  className="w-16 h-16 bg-white/80 border-2 border-[#141414] rounded-full flex items-center justify-center active:bg-gray-200 font-bold"
                >
                  JUMP
                </button>
              </div>
            </motion.div>
          )}

          {gameState === 'won' && (
            <motion.div
              key="won"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <div className="inline-block bg-white border-4 border-[#141414] p-12 shadow-[16px_16px_0px_0px_rgba(20,20,20,1)]">
                <Trophy size={80} className="mx-auto mb-6 text-yellow-500" />
                <h2 className="text-5xl font-black uppercase italic font-serif mb-2">Victory!</h2>
                <p className="text-xl font-mono mb-8">
                  Team <span className={`font-bold uppercase ${winner?.team === 'red' ? 'text-red-500' : 'text-blue-500'}`}>{winner?.team}</span> Wins!
                  <br />
                  <span className="text-sm opacity-60">MVP: {winner?.name}</span>
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-8 py-4 bg-[#141414] text-white font-black uppercase tracking-widest hover:bg-emerald-500 transition-colors"
                >
                  Play Again
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer / Stats */}
      <footer className="h-12 border-t border-[#141414] bg-white flex items-center justify-between px-6 font-mono text-[10px] uppercase tracking-widest opacity-50">
        <div>Players Online: {Object.keys(players).length}</div>
        <div>Server Status: Operational</div>
      </footer>
    </div>
  );
}
