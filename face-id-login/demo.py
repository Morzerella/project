#!/usr/bin/env python3
"""
Demo script for Face ID Login System
This script helps test the face registration and verification system
"""

import requests
import json
import base64
import cv2
import os
import time

class FaceIDDemo:
    def __init__(self, server_url="http://localhost:5000"):
        self.server_url = server_url
        self.api_url = f"{server_url}/api"
    
    def check_server_health(self):
        """Check if the server is running"""
        try:
            response = requests.get(f"{server_url}/health")
            if response.status_code == 200:
                data = response.json()
                print("✅ Server is healthy!")
                print(f"   - Face recognition: {'Available' if data['face_recognition_available'] else 'Not available'}")
                print(f"   - Registered users: {data['registered_users']}")
                return True
            else:
                print("❌ Server returned error:", response.status_code)
                return False
        except requests.exceptions.ConnectionError:
            print("❌ Cannot connect to server. Make sure it's running on localhost:5000")
            return False
        except Exception as e:
            print(f"❌ Error checking server: {e}")
            return False
    
    def get_users(self):
        """Get list of users and their face data status"""
        try:
            response = requests.get(f"{self.api_url}/users")
            if response.status_code == 200:
                users = response.json()['users']
                print("\n👥 Registered Users:")
                for user in users:
                    status = "✅ Has face data" if user['has_face_data'] else "❌ No face data"
                    print(f"   - {user['username']}: {status}")
                return users
            else:
                print("❌ Error getting users:", response.status_code)
                return []
        except Exception as e:
            print(f"❌ Error getting users: {e}")
            return []
    
    def capture_test_image(self, username="test_user"):
        """Capture an image from webcam for testing"""
        print(f"\n📷 Capturing test image for user: {username}")
        print("Press SPACE to capture, ESC to cancel")
        
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("❌ Cannot open camera")
            return None
        
        # Load face detector for preview
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            # Detect faces for preview
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(gray, 1.1, 4)
            
            # Draw rectangles around faces
            for (x, y, w, h) in faces:
                color = (0, 255, 0) if len(faces) == 1 else (0, 0, 255)
                cv2.rectangle(frame, (x, y), (x+w, y+h), color, 2)
            
            # Add instructions
            cv2.putText(frame, f"User: {username}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            cv2.putText(frame, "SPACE: Capture, ESC: Cancel", (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            
            if len(faces) == 1:
                cv2.putText(frame, "Face detected - Ready to capture!", (10, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            elif len(faces) > 1:
                cv2.putText(frame, "Multiple faces - Please ensure only one face", (10, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            else:
                cv2.putText(frame, "No face detected", (10, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2)
            
            cv2.imshow('Face ID Demo - Capture', frame)
            
            key = cv2.waitKey(1) & 0xFF
            if key == ord(' '):  # Space to capture
                if len(faces) == 1:
                    # Save image
                    timestamp = str(int(time.time()))
                    filename = f"test_face_{username}_{timestamp}.jpg"
                    cv2.imwrite(filename, frame)
                    print(f"✅ Image saved as {filename}")
                    cap.release()
                    cv2.destroyAllWindows()
                    return filename
                else:
                    print("❌ Please ensure exactly one face is visible")
            elif key == 27:  # ESC to cancel
                break
        
        cap.release()
        cv2.destroyAllWindows()
        return None
    
    def image_to_base64(self, image_path):
        """Convert image to base64 for API"""
        try:
            with open(image_path, 'rb') as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
                return f"data:image/jpeg;base64,{encoded_string}"
        except Exception as e:
            print(f"❌ Error encoding image: {e}")
            return None
    
    def test_face_detection(self, image_path):
        """Test face detection on an image"""
        print(f"\n🔍 Testing face detection on {image_path}")
        
        # Load and display image with face detection
        img = cv2.imread(image_path)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        faces = face_cascade.detectMultiScale(gray, 1.1, 4)
        
        for (x, y, w, h) in faces:
            cv2.rectangle(img, (x, y), (x+w, y+h), (255, 0, 0), 2)
        
        print(f"   Detected {len(faces)} face(s)")
        
        cv2.imshow('Face Detection Test', img)
        cv2.waitKey(0)
        cv2.destroyAllWindows()
        
        return len(faces) == 1

def main():
    print("=== Face ID Login System Demo ===\n")
    
    demo = FaceIDDemo()
    
    # Check server health
    if not demo.check_server_health():
        print("\n❌ Server is not running. Please start the Flask server first:")
        print("   python app.py")
        return
    
    # Get current users
    users = demo.get_users()
    
    while True:
        print("\n" + "="*50)
        print("Demo Options:")
        print("1. Capture test image")
        print("2. Test face detection on image")
        print("3. Check server status")
        print("4. View users")
        print("5. Exit")
        
        choice = input("\nEnter your choice (1-5): ").strip()
        
        if choice == '1':
            username = input("Enter username for test capture (or press Enter for 'test_user'): ").strip()
            if not username:
                username = "test_user"
            
            image_path = demo.capture_test_image(username)
            if image_path:
                print(f"\n✅ Image captured successfully: {image_path}")
                test_detection = input("Test face detection on this image? (y/N): ").strip().lower()
                if test_detection == 'y':
                    demo.test_face_detection(image_path)
        
        elif choice == '2':
            image_path = input("Enter path to image file: ").strip()
            if os.path.exists(image_path):
                demo.test_face_detection(image_path)
            else:
                print("❌ Image file not found")
        
        elif choice == '3':
            demo.check_server_health()
        
        elif choice == '4':
            demo.get_users()
        
        elif choice == '5':
            print("👋 Goodbye!")
            break
        
        else:
            print("❌ Invalid choice. Please enter 1-5.")

if __name__ == "__main__":
    main()