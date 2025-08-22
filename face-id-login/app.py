from flask import Flask, request
from flask_socketio import SocketIO, emit, disconnect
from flask_cors import CORS
import json
import base64
import cv2
import numpy as np
import os
from PIL import Image
import io
import hashlib
import time
import face_recognition
import math

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

users_db = {
    'Maitri': {
        'password': 'maitri123',
        'face_encodings': [],
        'face_images': ['admin_face1.jpg', 'admin_face2.jpg']  
    },
    'Darshan': {
        'password': 'darshan123',
        'face_encodings': [],
        'face_images': ['user1_face1.jpg', 'user1_face2.jpg']  
    
    
    }
}

# Directory to store reference face images
FACE_DATA_DIR = 'face_data'
if not os.path.exists(FACE_DATA_DIR):
    os.makedirs(FACE_DATA_DIR)

class FaceIDManager:
    def __init__(self):
        self.tolerance = 0.5  # Balanced tolerance (0.5 is good middle ground)
        self.confidence_threshold = 0.55  # Lower confidence threshold (55%)
        self.load_existing_faces()
    
    def load_existing_faces(self):
        """Load existing face encodings from stored images"""
        try:
            for username in users_db:
                user_face_dir = os.path.join(FACE_DATA_DIR, username)
                
                # Create user directory if it doesn't exist
                if not os.path.exists(user_face_dir):
                    os.makedirs(user_face_dir)
                    print(f"Created directory for user: {username}")
                
                encodings = []
                
                # Try to load existing images
                if os.path.exists(user_face_dir):
                    for filename in os.listdir(user_face_dir):
                        if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                            image_path = os.path.join(user_face_dir, filename)
                            try:
                                image = face_recognition.load_image_file(image_path)
                                face_encodings = face_recognition.face_encodings(image)
                                if face_encodings:
                                    encodings.append(face_encodings[0])
                                    print(f"✅ Loaded face encoding from {filename} for {username}")
                            except Exception as e:
                                print(f"❌ Error loading {filename}: {e}")
                
                users_db[username]['face_encodings'] = encodings
                print(f"📊 Total loaded {len(encodings)} face encodings for user {username}")
                
                # If no faces found, show instruction
                if len(encodings) == 0:
                    print(f"⚠️  No face images found for {username}")
                    print(f"   📁 Add face images to: {user_face_dir}")
                    print(f"   📸 Supported formats: .jpg, .png, .jpeg")
                    
        except Exception as e:
            print(f"❌ Error loading existing faces: {e}")
    
    def decode_image(self, image_data):
        """Decode base64 image data"""
        try:
            # Remove data URL prefix if present
            if ',' in image_data:
                image_data = image_data.split(',')[1]
            
            # Decode base64
            image_bytes = base64.b64decode(image_data)
            
            # Convert to PIL Image
            image = Image.open(io.BytesIO(image_bytes))
            
            # Convert to RGB if necessary
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # Convert to numpy array
            image_array = np.array(image)
            
            return image_array
        except Exception as e:
            print(f"❌ Error decoding image: {e}")
            return None
    
    def detect_faces_with_boxes(self, image_rgb):
        """Detect faces and return bounding boxes"""
        try:
            # Convert RGB to BGR for OpenCV
            image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
            
            # Use face_recognition to find faces
            face_locations = face_recognition.face_locations(image_rgb)
            
            if not face_locations:
                return [], "No face detected"
            
            if len(face_locations) > 1:
                return [], "Multiple faces detected. Please ensure only one face is visible."
            
            # Convert face_recognition format (top, right, bottom, left) to OpenCV format (x, y, w, h)
            bboxes = []
            for (top, right, bottom, left) in face_locations:
                x, y, w, h = left, top, right - left, bottom - top
                bboxes.append((x, y, w, h))
            
            # Return immediately when face is detected - no positioning requirements
            return bboxes, "Face detected and ready for verification"
            
        except Exception as e:
            print(f"❌ Error in face detection: {e}")
            return [], f"Face detection failed: {str(e)}"
    
    def verify_face(self, image_data):
        """Verify a face against all registered users with strict validation"""
        try:
            image_rgb = self.decode_image(image_data)
            if image_rgb is None:
                return False, None, "Failed to decode image"
            
            # Detect faces and get bounding boxes
            bboxes, message = self.detect_faces_with_boxes(image_rgb)
            
            if not bboxes:
                return False, None, message
            
            # Get face encoding for the current image
            face_encodings = face_recognition.face_encodings(image_rgb)
            if not face_encodings:
                return False, None, "Could not encode face for verification"
            
            unknown_encoding = face_encodings[0]
            
            # Check against all registered users with detailed logging
            best_match_user = None
            best_distance = float('inf')
            all_results = []
            
            for username, user_data in users_db.items():
                known_encodings = user_data.get('face_encodings', [])
                
                if not known_encodings:
                    continue
                
                # Compare with all known faces for this user
                matches = face_recognition.compare_faces(
                    known_encodings, 
                    unknown_encoding, 
                    tolerance=self.tolerance
                )
                
                # Calculate distances for all faces
                face_distances = face_recognition.face_distance(
                    known_encodings, 
                    unknown_encoding
                )
                
                for i, (match, distance) in enumerate(zip(matches, face_distances)):
                    confidence = (1 - distance) * 100
                    all_results.append({
                        'username': username,
                        'match': match,
                        'distance': distance,
                        'confidence': confidence
                    })
                    
                    print(f"🔍 {username}: Match={match}, Distance={distance:.3f}, Confidence={confidence:.1f}%")
                    
                    if match and distance < best_distance:
                        best_distance = distance
                        best_match_user = username
            
            # Apply strict validation
            if best_match_user:
                final_confidence = (1 - best_distance) * 100
                
                # Require high confidence for verification
                if final_confidence >= (self.confidence_threshold * 100):
                    print(f"✅ VERIFICATION SUCCESS: {best_match_user} with {final_confidence:.1f}% confidence")
                    return True, best_match_user, f"Face verified with {final_confidence:.1f}% confidence"
                else:
                    print(f"❌ VERIFICATION FAILED: Confidence {final_confidence:.1f}% below threshold {self.confidence_threshold*100}%")
                    return False, None, f"Low confidence match ({final_confidence:.1f}%). Not verified."
            else:
                print(f"❌ NO MATCH FOUND: No faces matched above tolerance threshold")
                return False, None, "Face not recognized in database"
            
        except Exception as e:
            print(f"❌ Error verifying face: {e}")
            return False, None, f"Verification failed: {str(e)}"

# Initialize Face ID Manager
face_manager = FaceIDManager()

@socketio.on('connect')
def handle_connect():
    print('🔗 Client connected')
    emit('status', {'msg': 'Connected to Face ID server'})

@socketio.on('disconnect')
def handle_disconnect():
    print('🔌 Client disconnected')

@socketio.on('detect_face')
def handle_detect_face(data):
    """Handle real-time face detection with bounding boxes"""
    try:
        image_data = data.get('image')
        
        if not image_data:
            emit('face_detection', {
                'success': False,
                'message': 'Image data required'
            })
            return
        
        image_rgb = face_manager.decode_image(image_data)
        if image_rgb is None:
            emit('face_detection', {
                'success': False,
                'message': 'Failed to decode image'
            })
            return
        
        # Detect faces and get bounding boxes
        bboxes, message = face_manager.detect_faces_with_boxes(image_rgb)
        
        # Prepare response
        response = {
            'success': len(bboxes) > 0,
            'message': message,
            'bounding_boxes': []
        }
        
        if bboxes:
            for bbox in bboxes:
                x, y, w, h = bbox
                response['bounding_boxes'].append({
                    'x': int(x),
                    'y': int(y),
                    'width': int(w),
                    'height': int(h)
                })
            
            # Always ready for verification when face is detected
            response['ready_for_verification'] = True
        else:
            response['ready_for_verification'] = False
        
        emit('face_detection', response)
        
    except Exception as e:
        print(f"❌ Error in detect_face: {e}")
        emit('face_detection', {
            'success': False,
            'message': f'Detection error: {str(e)}',
            'bounding_boxes': [],
            'ready_for_verification': False
        })

@socketio.on('verify_face')
def handle_verify_face(data):
    """Handle face verification"""
    try:
        image_data = data.get('image')
        
        if not image_data:
            emit('face_verification', {
                'success': False,
                'message': 'Image data required'
            })
            return
        
        success, username, message = face_manager.verify_face(image_data)
        
        emit('face_verification', {
            'type': 'face_verification',
            'success': success,
            'username': username,
            'message': message
        })
        
        if success:
            print(f"✅ Face verification successful for user: {username}")
        else:
            print(f"❌ Face verification failed: {message}")
        
    except Exception as e:
        print(f"❌ Error in verify_face: {e}")
        emit('face_verification', {
            'success': False,
            'message': f'Verification error: {str(e)}'
        })

@socketio.on('login')
def handle_login(data):
    """Handle traditional username/password login"""
    try:
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            emit('login_result', {
                'success': False,
                'message': 'Username and password required'
            })
            return
        
        # Check credentials
        if username in users_db and users_db[username]['password'] == password:
            emit('login_result', {
                'success': True,
                'message': 'Login successful',
                'username': username
            })
            print(f"✅ Username/password login successful for user: {username}")
        else:
            emit('login_result', {
                'success': False,
                'message': 'Invalid username or password'
            })
            print(f"❌ Username/password login failed for user: {username}")
            
    except Exception as e:
        print(f"❌ Error in login: {e}")
        emit('login_result', {
            'success': False,
            'message': f'Login error: {str(e)}'
        })

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return {
        'status': 'healthy',
        'face_recognition_available': True,
        'registered_users': len(users_db)
    }

@app.route('/api/users', methods=['GET'])
def get_users():
    """REST endpoint to get users"""
    return {
        'users': [
            {
                'username': username,
                'has_face_data': len(data.get('face_encodings', [])) > 0
            }
            for username, data in users_db.items()
        ]
    }

if __name__ == '__main__':
    print("🚀 === Face ID Authentication Server ===")
    print("🌐 Server starting on http://localhost:5000")
    print("\n👥 Registered users:")
    for username in users_db:
        face_count = len(users_db[username].get('face_encodings', []))
        print(f"   - {username} (password: {users_db[username]['password']}, faces: {face_count})")
    
    print(f"\n📁 Face data directory: {FACE_DATA_DIR}")
    print("\n🔌 WebSocket endpoints:")
    print("   - connect: Client connection")
    print("   - detect_face: Real-time face detection with bounding boxes")
    print("   - verify_face: Verify face identity")
    print("   - login: Traditional login")
    
    print("\n🌐 REST endpoints:")
    print("   - GET /health: Health check")
    print("   - GET /api/users: Get users with face data status")
    
    print("\n" + "="*60)
    print("💡 To add your face: Save image as face_data/admin/my_face.jpg")
    print("="*60)
    
    try:
        socketio.run(app, host='0.0.0.0', port=5000, debug=True)
    except KeyboardInterrupt:
        print("\n🛑 Server shutting down...")
    except Exception as e:
        print(f"❌ Server error: {e}")
