"""
Download pose_landmarker_lite.task model bundle if not present.
Uses the official Google MediaPipe storage URL.
"""
import os
import urllib.request

MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(MODEL_DIR, "pose_landmarker_lite.task")


def ensure_model_exists() -> str:
    if os.path.exists(MODEL_PATH) and os.path.getsize(MODEL_PATH) > 1000000:
        return MODEL_PATH

    print(f"Downloading MediaPipe Pose model to {MODEL_PATH}...")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    print("MediaPipe Pose model downloaded successfully.")
    return MODEL_PATH


if __name__ == "__main__":
    ensure_model_exists()
