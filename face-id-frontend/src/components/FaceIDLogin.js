import React, { useState, useRef, useEffect, useCallback } from 'react';
import io from 'socket.io-client';

const FaceIDLogin = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [ws, setWs] = useState(null);
  const [readyForVerification, setReadyForVerification] = useState(false);
  const [showVerifyButton, setShowVerifyButton] = useState(false);
  // Connection status states
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const detectionIntervalRef = useRef(null);

  const drawBoundingBoxes = useCallback((boxes, color = 'green') => {
    if (!canvasRef.current || !videoRef.current) return;
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set canvas size to match video display size
    const rect = video.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    
    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Calculate scale factors
    const scaleX = rect.width / video.videoWidth;
    const scaleY = rect.height / video.videoHeight;
    
    // Draw bounding boxes
    boxes.forEach(box => {
      // Scale the coordinates to match the displayed video size
      const scaledX = box.x * scaleX;
      const scaledY = box.y * scaleY;
      const scaledWidth = box.width * scaleX;
      const scaledHeight = box.height * scaleY;
      
      // Draw main bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);
      
      // Draw corner markers only
      const cornerSize = 15;
      ctx.lineWidth = 3;
      
      // Top-left corner
      ctx.beginPath();
      ctx.moveTo(scaledX, scaledY + cornerSize);
      ctx.lineTo(scaledX, scaledY);
      ctx.lineTo(scaledX + cornerSize, scaledY);
      ctx.stroke();
      
      // Top-right corner
      ctx.beginPath();
      ctx.moveTo(scaledX + scaledWidth - cornerSize, scaledY);
      ctx.lineTo(scaledX + scaledWidth, scaledY);
      ctx.lineTo(scaledX + scaledWidth, scaledY + cornerSize);
      ctx.stroke();
      
      // Bottom-left corner
      ctx.beginPath();
      ctx.moveTo(scaledX, scaledY + scaledHeight - cornerSize);
      ctx.lineTo(scaledX, scaledY + scaledHeight);
      ctx.lineTo(scaledX + cornerSize, scaledY + scaledHeight);
      ctx.stroke();
      
      // Bottom-right corner
      ctx.beginPath();
      ctx.moveTo(scaledX + scaledWidth - cornerSize, scaledY + scaledHeight);
      ctx.lineTo(scaledX + scaledWidth, scaledY + scaledHeight);
      ctx.lineTo(scaledX + scaledWidth, scaledY + scaledHeight - cornerSize);
      ctx.stroke();
    });
  }, []);

  const clearBoundingBoxes = useCallback(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const stopDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    clearBoundingBoxes();
    setReadyForVerification(false);
    setShowVerifyButton(false);
  }, [clearBoundingBoxes]);

  const startDetection = useCallback(() => {
    if (!ws || !videoRef.current) return;
    
    detectionIntervalRef.current = setInterval(() => {
      if (videoRef.current && ws.connected) {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0, 640, 480);
        
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        
        ws.emit('detect_face', {
          image: imageData
        });
      }
    }, 500);
  }, [ws]);

  // Socket.IO connection with enhanced connection tracking
  useEffect(() => {
    const socket = io('http://localhost:5000', {
      timeout: 5000,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });
    
    socket.on('connect', () => {
      console.log('Connected to Socket.IO server');
      setWs(socket);
      setIsConnected(true);
      setConnectionStatus('Connected');
      setReconnectAttempts(0);
    });

    socket.on('connect_error', (error) => {
      console.log('Connection error:', error);
      setIsConnected(false);
      setConnectionStatus('Connection Failed');
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from Socket.IO server:', reason);
      setIsConnected(false);
      setConnectionStatus('Disconnected');
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('Reconnection attempt:', attemptNumber);
      setReconnectAttempts(attemptNumber);
      setConnectionStatus(`Reconnecting... (${attemptNumber})`);
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('Reconnected after', attemptNumber, 'attempts');
      setIsConnected(true);
      setConnectionStatus('Reconnected');
      setReconnectAttempts(0);
    });

    socket.on('reconnect_failed', () => {
      console.log('Reconnection failed');
      setIsConnected(false);
      setConnectionStatus('Connection Failed');
    });
    
    socket.on('face_detection', (data) => {
      console.log('Received face_detection:', data);
      setScanStatus(data.message || '');
      
      // Show verify button as soon as ANY face is detected
      const faceDetected = data.bounding_boxes && data.bounding_boxes.length > 0;
      setReadyForVerification(faceDetected);
      setShowVerifyButton(faceDetected);
      
      if (faceDetected) {
        drawBoundingBoxes(data.bounding_boxes, 'green');
        setScanStatus('Face detected! Ready to verify');
      } else {
        clearBoundingBoxes();
        setScanStatus('Looking for face...');
      }
    });
    
    socket.on('face_verification', (data) => {
      console.log('Received face_verification:', data);
      if (data.success) {
        setScanStatus('Face verified successfully!');
        setTimeout(() => {
          alert(`Welcome ${data.username}! Login successful!`);
          setScanStatus('');
          setIsScanning(false);
          stopDetection();
        }, 1000);
      } else {
        setScanStatus('Face verification failed. Please try again.');
        setTimeout(() => setScanStatus(''), 3000);
      }
    });
    
    socket.on('login_result', (data) => {
      console.log('Received login_result:', data);
      if (data.success) {
        if (data.requires_face_id) {
          alert(`User ${data.username} found! Please use Face ID for authentication.`);
        } else {
          alert(`Welcome ${data.username}! Login successful!`);
        }
      } else {
        alert(data.message || 'Login failed');
      }
    });
    
    return () => {
      socket.disconnect();
    };
  }, [stopDetection, clearBoundingBoxes, drawBoundingBoxes]);

  const startFaceCapture = async () => {
    if (!isConnected) {
      alert('Not connected to server. Please check if the backend is running.');
      return;
    }

    try {
      setIsScanning(true);
      setScanStatus('Accessing camera...');
      setReadyForVerification(false);
      setShowVerifyButton(false);
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Start detection when video is loaded
        videoRef.current.onloadedmetadata = () => {
          setScanStatus('Looking for face...');
          startDetection();
        };
      }
      
    } catch (error) {
      console.error('Error accessing camera:', error);
      setScanStatus('Camera access denied. Please allow camera permissions.');
      setIsScanning(false);
    }
  };

  const verifyFace = () => {
    if (!isConnected) {
      alert('Not connected to server. Cannot verify face.');
      return;
    }

    if (videoRef.current && ws && readyForVerification) {
      setScanStatus('Verifying face... Please hold still');
      setShowVerifyButton(false);
      
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0);
      
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      
      // Send to Socket.IO for verification
      ws.emit('verify_face', {
        image: imageData
      });
    }
  };

  const handleUsernameLogin = (e) => {
    if (!isConnected) {
      alert('Not connected to server. Please check if the backend is running.');
      return;
    }

    if (username && password) {
      if (ws) {
        ws.emit('login', {
          username: username,
          password: password
        });
      }
    } else {
      alert('Please enter both username and password');
    }
  };

  const stopScanning = () => {
    setIsScanning(false);
    setScanStatus('');
    stopDetection();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  // Connection Status Component
  const ConnectionStatus = () => (
    <div className="fixed top-4 right-4 z-50">
      <div className={`flex items-center px-4 py-2 rounded-lg shadow-lg ${
        isConnected 
          ? 'bg-green-100 text-green-800 border border-green-300' 
          : 'bg-red-100 text-red-800 border border-red-300'
      }`}>
        <div className={`w-3 h-3 rounded-full mr-2 ${
          isConnected ? 'bg-green-500' : 'bg-red-500'
        } ${!isConnected ? 'animate-pulse' : ''}`}></div>
        <span className="text-sm font-medium">
          {connectionStatus}
          {reconnectAttempts > 0 && ` (${reconnectAttempts}/5)`}
        </span>
      </div>
    </div>
  );

  return (
    <>
      <ConnectionStatus />
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-6xl flex bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-200">
          {/* Left Panel - Face ID Scanner */}
          <div className="w-1/2 bg-white p-8 flex flex-col items-center justify-center text-gray-800 relative border-r border-gray-200">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4 text-gray-900">Face ID Access</h2>
              <p className="text-gray-600 mb-8">Secure biometric authentication</p>
            </div>
            
            {!isScanning ? (
              <div className="text-center">
                <div className="w-48 h-48 mx-auto mb-8 bg-gray-100 rounded-full flex items-center justify-center border-4 border-gray-300">
                  {/* Fingerprint Icon */}
                  <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                    <path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 10 10 10 10 0 0 1-5 8.7"/>
                    <path d="M5 12.859a10 10 0 0 0 5.17 8.73 10 10 0 0 0 3.66-2.06"/>
                    <path d="M10.87 17.24a6 6 0 0 0 2.26-5.24"/>
                    <path d="M8 12a4 4 0 0 1 8 0c0 1.5-.68 2.54-1.89 3.66"/>
                    <path d="M12 7a5 5 0 0 1 5 5"/>
                  </svg>
                </div>
                
                <div className="space-y-4">
                  <button
                    onClick={startFaceCapture}
                    disabled={!isConnected}
                    className={`px-8 py-4 rounded-2xl font-semibold text-lg transform transition-all duration-300 shadow-lg block w-full ${
                      isConnected 
                        ? 'bg-gray-900 text-white hover:bg-gray-800 hover:scale-105' 
                        : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                    }`}
                  >
                    {/* Camera Icon */}
                    <svg className="inline-block mr-2" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
                      <circle cx="12" cy="13" r="3"/>
                    </svg>
                    {isConnected ? 'Start Face ID Verification' : 'Server Disconnected'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="relative w-80 h-60 mx-auto mb-6 bg-black rounded-2xl overflow-hidden border-4 border-gray-300">
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    className="w-full h-full object-cover"
                  />
                  <canvas
                    ref={canvasRef}
                    className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"
                    style={{
                      mixBlendMode: 'normal'
                    }}
                  />
                  {showVerifyButton && (
                    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20">
                      <button
                        onClick={verifyFace}
                        className="bg-green-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-600 transition-colors shadow-lg"
                      >
                        Verify Face
                      </button>
                    </div>
                  )}
                </div>
                
                {/* Status message - moved outside video container */}
                <div className="mb-6">
                  {scanStatus && (
                    <div className="flex flex-col items-center">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600 mb-3"></div>
                      <p className={`text-base font-medium ${
                        readyForVerification 
                          ? 'text-green-600' 
                          : scanStatus.includes('Looking') 
                            ? 'text-gray-600' 
                            : 'text-gray-700'
                      }`}>
                        {scanStatus}
                      </p>
                    </div>
                  )}
                </div>
                
                {/* Cancel button */}
                <button
                  onClick={stopScanning}
                  className="bg-red-500 text-white px-8 py-3 rounded-xl hover:bg-red-600 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            )}
            
            <div className="absolute bottom-8 left-8 right-8">
              <div className="text-center text-sm text-gray-500">
                Face ID Authentication System
              </div>
            </div>
          </div>

          {/* Right Panel - Traditional Login */}
          <div className="w-1/2 p-8 flex flex-col justify-center bg-white">
            <div className="max-w-sm mx-auto w-full">
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back!</h1>
                <p className="text-gray-600">Sign in to your account</p>
              </div>

              <div className="space-y-6">
                <div>
                  <div className="relative">
                    {/* User Icon */}
                    <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                    <input
                      type="text"
                      placeholder="Username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-all"
                      onKeyPress={(e) => e.key === 'Enter' && handleUsernameLogin(e)}
                    />
                  </div>
                </div>

                <div>
                  <div className="relative">
                    {/* Lock Icon */}
                    <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <circle cx="12" cy="16" r="1"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-12 py-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-all"
                      onKeyPress={(e) => e.key === 'Enter' && handleUsernameLogin(e)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? (
                        // Eye Off Icon
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        // Eye Icon
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleUsernameLogin}
                  disabled={!isConnected}
                  className={`w-full py-4 rounded-xl font-semibold transform transition-all duration-300 shadow-lg ${
                    isConnected 
                      ? 'bg-gray-900 text-white hover:bg-gray-800 hover:scale-[1.02]' 
                      : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                  }`}
                >
                  {isConnected ? 'Sign In' : 'Server Disconnected'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default FaceIDLogin;