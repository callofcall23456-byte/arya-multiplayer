'use strict';
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 20e6 });
const PORT = process.env.PORT || 3000;
const rooms = new Map();
app.use(express.static(__dirname));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'arya-multiplayer' }));
function safeRoom(value) { return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24); }
io.on('connection', socket => {
  socket.on('join-room', payload => {
    const room = safeRoom(payload && payload.room);
    const side = payload && payload.side;
    if (!room || !['aria', 'baran'].includes(side)) {
      socket.emit('room-error', { message: 'کد اتاق یا کشور انتخاب‌شده معتبر نیست.' }); return;
    }
    let state = rooms.get(room);
    if (!state) { state = { players: { aria: null, baran: null }, snapshot: null }; rooms.set(room, state); }
    if (state.players[side] && state.players[side] !== socket.id) {
      socket.emit('room-error', { message: 'این کشور قبلاً در این اتاق اشغال شده؛ کشور دیگر را انتخاب کنید.' }); return;
    }
    socket.data.room = room; socket.data.side = side;
    state.players[side] = socket.id; socket.join(room);
    socket.emit('joined', { message: 'ورود به اتاق ' + room + ' موفق بود.', state: state.snapshot });
    socket.to(room).emit('peer-joined', { side });
  });
  socket.on('game-state', payload => {
    const room = safeRoom(payload && payload.room);
    const state = rooms.get(room);
    if (!state || socket.data.room !== room || socket.data.side !== payload.side || !payload.state) return;
    // Only the side whose turn it is may publish ordinary updates. Initial state is accepted too.
    const active = payload.state.activeCountry;
    if (state.snapshot && state.snapshot.activeCountry !== payload.side && active !== payload.side) return;
    state.snapshot = payload.state;
    socket.to(room).emit('game-state', { side: payload.side, state: payload.state, sentAt: Date.now() });
  });
  socket.on('disconnect', () => {
    const room = socket.data.room, side = socket.data.side;
    if (!room || !side) return;
    const state = rooms.get(room);
    if (state && state.players[side] === socket.id) {
      state.players[side] = null;
      socket.to(room).emit('peer-left', { side });
      if (!state.players.aria && !state.players.baran && !state.snapshot) rooms.delete(room);
    }
  });
});
server.listen(PORT, '0.0.0.0', () => console.log(`Arya multiplayer server listening on http://0.0.0.0:${PORT}`));
