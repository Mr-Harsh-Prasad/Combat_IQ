# Combat IQ

Combat IQ is an AI-powered Taekwondo coaching system designed to help athletes improve their technique without needing a physical coach. It uses computer vision and pose detection to analyze movements in real-time and provide instant feedback.

🎥 **Demo Video:**  
👉 https://youtu.be/Rlzk09GxTrQ?si=ULH45b_rmjiXkBOQ

## 📌 Problem Statement

Traditional Taekwondo training depends heavily on coaches, making it:
- Expensive 💸
- Inaccessible to many learners 🌍
- Lacking real-time, objective feedback

Most beginners practice without proper guidance, leading to incorrect techniques and slow progress.

## 💡 Solution

Combat IQ solves this by acting as a personal AI coach that:
- Tracks body movement using camera input
- Analyzes posture and kicks
- Provides real-time feedback and corrections

AI-based systems can deliver objective and consistent feedback compared to traditional subjective coaching.

## ⚙️ Features

- ✅ **Real-time pose detection**
- ✅ **Kick analysis** (accuracy, angle, speed)
- ✅ **Instant feedback and suggestions**
- ✅ **No wearable sensors required**
- ✅ **Works with a normal camera**

Computer vision allows tracking of body joints and movements precisely without external sensors.

## 🧠 Tech Stack

- Python
- OpenCV
- MediaPipe (Pose Detection)
- NumPy
- Machine Learning (Scikit-learn / custom logic)

## 🏗️ How It Works

1. Capture live video from camera
2. Detect human pose using MediaPipe
3. Extract key body landmarks
4. Analyze movement patterns
5. Compare with ideal Taekwondo techniques
6. Provide feedback in real-time

AI systems can analyze motion patterns and classify techniques using pose estimation and deep learning.

## 🎯 Use Cases

- 🥋 Beginners learning Taekwondo at home
- 🧑‍🏫 Coaches for performance analysis
- 🏫 Training academies
- 🏆 Athletes improving technique

## 📊 Future Improvements

- 🔥 Advanced kick classification (roundhouse, axe, etc.)
- 📈 Performance tracking dashboard
- 🎯 AI scoring system
- 📱 Mobile app integration
- 🤖 Personalized training plans

## 🚀 Getting Started

1️⃣ **Clone the repository**
```bash
git clone https://github.com/Mr-Harsh-Prasad/Combat_IQ.git
cd Combat_IQ
```

2️⃣ **Install dependencies**
```bash
pip install -r requirements.txt
```

3️⃣ **Run the project**
```bash
python main.py
```

## 🤝 Contribution

Contributions are welcome!  
Feel free to fork this repo and submit a pull request.

## 📜 License

This project is licensed under the MIT License.

## 👨‍💻 Author

**Harsh Kumar**  
B.Tech CS  
Taekwondo Black Belt 🥋
