import DailyIframe from 'https://unpkg.com/@daily-co/daily-js@0.60.0/dist/daily-iframe.esm.js';

// ============================================
// CONNECTION MANAGER CLASS
// ============================================

class ConnectionManager {
  constructor() {
    this.socket = null;
    this.dailyCall = null;
    this.token = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
    this.heartbeatInterval = null;
    this.participants = new Map();
  }

  // ============================================
  // AUTHENTICATION & INITIALIZATION
  // ============================================

  async initialize(authToken) {
    try {
      this.token = authToken;
      
      // Initialize Socket.io connection
      await this.connectWebSocket();
      
      // Setup heartbeat
      this.startHeartbeat();
      
      console.log('✅ Connection Manager initialized');
      
    } catch (error) {
      console.error('❌ Failed to initialize:', error);
      throw error;
    }
  }

  // ============================================
  // WEBSOCKET CONNECTION
  // ============================================

  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        // Connect to server
        this.socket = io('http://localhost:3000', {
          auth: { token: this.token },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionDelay: this.reconnectDelay,
          reconnectionAttempts: this.maxReconnectAttempts
        });

        // Connection events
        this.socket.on('connect', () => {
          console.log('🟢 WebSocket connected:', this.socket.id);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.onConnectionStateChange('connected');
          resolve();
        });

        this.socket.on('disconnect', (reason) => {
          console.log('🔴 WebSocket disconnected:', reason);
          this.isConnected = false;
          this.onConnectionStateChange('disconnected');
          
          // Clean up Daily call on disconnect
          if (this.dailyCall) {
            this.leaveDailyRoom();
          }
        });

        this.socket.on('connect_error', (error) => {
          console.error('❌ Connection error:', error.message);
          reject(error);
        });

        this.socket.on('reconnect_attempt', (attempt) => {
          console.log(`🔄 Reconnection attempt ${attempt}...`);
          this.reconnectAttempts = attempt;
          this.onConnectionStateChange('reconnecting');
        });

        this.socket.on('reconnect', (attempt) => {
          console.log(`✅ Reconnected after ${attempt} attempts`);
          this.reconnectAttempts = 0;
          this.onConnectionStateChange('connected');
        });

        this.socket.on('reconnect_failed', () => {
          console.error('❌ Reconnection failed');
          this.onConnectionStateChange('failed');
          reject(new Error('Reconnection failed'));
        });

        // Server events
        this.setupServerEventListeners();

        // Error handler
        this.socket.on('error', (error) => {
          console.error('Socket error:', error);
          this.onError(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  setupServerEventListeners() {
    // Room events
    this.socket.on('room:joined', (data) => {
      console.log('✅ Joined room:', data);
      this.onRoomJoined(data);
    });

    this.socket.on('room:state', (state) => {
      console.log('📊 Room state:', state);
      this.updateParticipantsList(state.participants);
    });

    this.socket.on('participant:joined', (data) => {
      console.log('👤 Participant joined:', data.userName);
      this.onParticipantJoined(data);
    });

    this.socket.on('participant:left', (data) => {
      console.log('👋 Participant left:', data.userName);
      this.onParticipantLeft(data);
    });

    this.socket.on('participant:audio-changed', (data) => {
      console.log('🎤 Audio changed:', data.userName, data.isMuted);
      this.onParticipantAudioChanged(data);
    });

    // Admin events
    this.socket.on('kicked', (data) => {
      console.warn('⚠️ You were kicked:', data);
      alert(`You have been removed from the room by ${data.by}.\nReason: ${data.reason}`);
      this.disconnect();
    });

    this.socket.on('forced-mute', (data) => {
      console.warn('🔇 Force muted by:', data.by);
      if (this.dailyCall) {
        this.dailyCall.setLocalAudio(false);
        this.updateMuteUI(true);
      }
      alert(`You have been muted by ${data.by}`);
    });

    // Emergency events
    this.socket.on('emergency:received', (data) => {
      console.warn('🚨 Emergency alert:', data);
      this.onEmergencyAlert(data);
    });

    this.socket.on('emergency:sent', (data) => {
      console.log('✅ Emergency sent:', data);
      this.showNotification('Emergency alert sent successfully', 'success');
    });
  }

  // ============================================
  // DAILY.CO ROOM CONNECTION
  // ============================================

  async joinDailyRoom(roomName, userName, isHost = false) {
    try {
      console.log('🚪 Joining Daily room...', { roomName, userName, isHost });

      // Get meeting token from server
      const token = await this.getMeetingToken(roomName);

      // Create Daily call object
      const callConfig = {
        url: `https://sunthre.daily.co/${roomName}`,
        token: token,
        userName: userName,
        audioSource: true,
        videoSource: false,
        dailyConfig: {
          experimentalChromeVideoMuteLightOff: true
        }
      };

      this.dailyCall = DailyIframe.createCallObject(callConfig);

      // Setup Daily event listeners
      this.setupDailyEventListeners();

      // Join the call
      await this.dailyCall.join();

      // Notify server via WebSocket
      this.socket.emit('room:join', {
        roomId: roomName,
        userName: userName
      });

      console.log('✅ Joined Daily room successfully');

    } catch (error) {
      console.error('❌ Failed to join Daily room:', error);
      throw error;
    }
  }

  setupDailyEventListeners() {
    // Meeting events
    this.dailyCall.on('joined-meeting', (event) => {
      console.log('✅ Daily meeting joined:', event.participants.local);
      this.onDailyJoined(event);
    });

    this.dailyCall.on('left-meeting', (event) => {
      console.log('👋 Left Daily meeting');
      this.onDailyLeft(event);
    });

    // Track events
    this.dailyCall.on('track-started', (event) => {
      console.log('▶️ Track started:', event.participant.user_name);
      if (event.track.kind === 'audio' && !event.participant.local) {
        this.playAudioTrack(event);
      }
    });

    this.dailyCall.on('track-stopped', (event) => {
      console.log('⏹️ Track stopped:', event.participant.user_name);
      this.removeAudioTrack(event);
    });

    // Participant events
    this.dailyCall.on('participant-joined', (event) => {
      console.log('👤 Daily participant joined:', event.participant.user_name);
    });

    this.dailyCall.on('participant-left', (event) => {
      console.log('👋 Daily participant left:', event.participant.user_name);
    });

    this.dailyCall.on('participant-updated', (event) => {
      // Handle ejection
      if (event.participant.local && event.participant.ejected) {
        console.warn('⚠️ Ejected from meeting');
        this.disconnect();
      }
    });

    // Error handling
    this.dailyCall.on('error', (error) => {
      console.error('❌ Daily error:', error);
      this.onError(error);
    });

    // Network quality
    this.dailyCall.on('network-quality-change', (event) => {
      console.log('📶 Network quality:', event.threshold, event.quality);
      this.onNetworkQualityChange(event);
    });
  }

  async leaveDailyRoom() {
    if (!this.dailyCall) return;

    try {
      await this.dailyCall.leave();
      this.dailyCall.destroy();
      this.dailyCall = null;
      
      // Notify server
      this.socket.emit('room:leave');
      
      console.log('✅ Left Daily room');
    } catch (error) {
      console.error('❌ Error leaving Daily room:', error);
    }
  }

  // ============================================
  // AUDIO MANAGEMENT
  // ============================================

  playAudioTrack(event) {
    const audioEl = document.createElement('audio');
    audioEl.id = `audio-${event.participant.session_id}`;
    audioEl.autoplay = true;
    audioEl.srcObject = new MediaStream([event.track]);
    document.body.appendChild(audioEl);

    audioEl.play().catch(error => {
      console.error('Error playing audio:', error);
    });
  }

  removeAudioTrack(event) {
    const audioEl = document.getElementById(`audio-${event.participant.session_id}`);
    if (audioEl) {
      audioEl.srcObject = null;
      audioEl.remove();
    }
  }

  toggleMute() {
    if (!this.dailyCall) return;

    const isMuted = this.dailyCall.localAudio();
    this.dailyCall.setLocalAudio(!isMuted);

    // Notify server
    this.socket.emit('audio:toggle', { isMuted: !isMuted });

    this.updateMuteUI(!isMuted);

    return !isMuted;
  }

  // ============================================
  // API CALLS
  // ============================================

  async getMeetingToken(roomName) {
    try {
      const response = await fetch('http://localhost:3000/api/v1/token/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ roomName })
      });

      if (!response.ok) {
        throw new Error('Failed to get meeting token');
      }

      const data = await response.json();
      return data.token;

    } catch (error) {
      console.error('❌ Token generation failed:', error);
      throw error;
    }
  }

  // ============================================
  // HEARTBEAT / PING-PONG
  // ============================================

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && this.socket) {
        this.socket.emit('ping', (response) => {
          const latency = Date.now() - response.timestamp;
          console.log(`💓 Ping: ${latency}ms`);
          this.updatePingDisplay(latency);
        });
      }
    }, 30000); // Every 30 seconds
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // ============================================
  // EMERGENCY SYSTEM
  // ============================================

  async sendEmergencyAlert() {
    try {
      // Get location
      const location = await this.getCurrentLocation();

      // Send to server
      this.socket.emit('emergency:alert', {
        location: location,
        message: 'I am separated from the group'
      });

      console.log('🚨 Emergency alert sent');

    } catch (error) {
      console.error('❌ Failed to send emergency:', error);
      alert('Failed to send emergency alert: ' + error.message);
    }
  }

  getCurrentLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      );
    });
  }

  // ============================================
  // ADMIN ACTIONS
  // ============================================

  kickParticipant(socketId, reason) {
    if (!this.socket) return;

    this.socket.emit('admin:kick', {
      targetSocketId: socketId,
      reason: reason
    });
  }

  muteParticipant(socketId) {
    if (!this.socket) return;

    this.socket.emit('admin:mute', {
      targetSocketId: socketId
    });
  }

  // ============================================
  // CLEANUP & DISCONNECT
  // ============================================

  async disconnect() {
    console.log('🔌 Disconnecting...');

    // Stop heartbeat
    this.stopHeartbeat();

    // Leave Daily room
    await this.leaveDailyRoom();

    // Disconnect WebSocket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    // Clear state
    this.participants.clear();
    this.isConnected = false;

    console.log('✅ Disconnected successfully');
  }

  // ============================================
  // UI CALLBACK METHODS (Override in your app)
  // ============================================

  onConnectionStateChange(state) {
    // Override this to update UI
    console.log('Connection state:', state);
  }

  onRoomJoined(data) {
    // Override this
    console.log('Room joined callback:', data);
  }

  onParticipantJoined(data) {
    // Override this
    console.log('Participant joined callback:', data);
  }

  onParticipantLeft(data) {
    // Override this
    console.log('Participant left callback:', data);
  }

  onParticipantAudioChanged(data) {
    // Override this
    console.log('Audio changed callback:', data);
  }

  onDailyJoined(event) {
    // Override this
    console.log('Daily joined callback');
  }

  onDailyLeft(event) {
    // Override this
    console.log('Daily left callback');
  }

  onEmergencyAlert(data) {
    // Override this
    console.log('Emergency alert callback:', data);
  }

  onNetworkQualityChange(event) {
    // Override this
    console.log('Network quality callback:', event);
  }

  onError(error) {
    // Override this
    console.error('Error callback:', error);
  }

  updateParticipantsList(participants) {
    // Override this to update UI
    console.log('Update participants:', participants);
  }

  updateMuteUI(isMuted) {
    // Override this to update mute button
    console.log('Update mute UI:', isMuted);
  }

  updatePingDisplay(latency) {
    // Override this to show ping
    console.log('Ping latency:', latency);
  }

  showNotification(message, type) {
    // Override this to show notifications
    console.log(`[${type}] ${message}`);
  }
}

// ============================================
// EXPORT
// ============================================

export default ConnectionManager;