import moviepy.editor as mp
import numpy as np
import librosa
import cv2
import tempfile
import streamlit as st
import matplotlib.pyplot as plt
import pandas as pd
from streamlit_extras.metric_cards import style_metric_cards

AGE_PARAMETERS = {
    '0-3': {'cuts': 2, 'volume': 60, 'visual_complexity': 50, 'sound_density': 2},
    '4-6': {'cuts': 4, 'volume': 70, 'visual_complexity': 100, 'sound_density': 4},
    '7-12': {'cuts': 8, 'volume': 80, 'visual_complexity': 150, 'sound_density': 6},
    '13+': {'cuts': float('inf'), 'volume': 85, 'visual_complexity': float('inf'), 'sound_density': float('inf')}
}

def detect_cuts(clip, interval=1.0, threshold=0.6):
    """
    Detects cuts or significant transitions in a video clip based on color histogram differences between frames.

    Parameters:
    - clip: Video object (for example, a MoviePy VideoFileClip) from which frames will be extracted.
    - interval (float): Interval in seconds between each analyzed frame. Defaults to 1.0 second.
    - threshold (float): Correlation threshold between histograms to determine a significant change. A lower value means greater sensitivity. Defaults to 0.6.

    Process:
    - Iterates over the video at the defined intervals, extracting one frame at each step.
    - Resizes each frame to 320x180 pixels to reduce computational load.
    - Computes and normalizes the color histogram (RGB) in 3 dimensions, with 8 bins per channel.
    - Compares the current frame's histogram with the previous one using correlation.
    - If the similarity between histograms is below the threshold, it is considered a cut.
    - Returns the average number of cuts per minute, rounded to two decimals.

    Returns:
    - float: Average number of cuts detected per minute in the video.
    """

    changes = 0
    previous_hist = None
    for t in np.arange(0, clip.duration, interval):
        frame = cv2.resize(clip.get_frame(t), (320, 180))
        hist = cv2.calcHist([frame], [0, 1, 2], None, [8,8,8], [0,256]*3)
        hist = cv2.normalize(hist, hist).flatten()
        if previous_hist is not None:
            difference = cv2.compareHist(previous_hist, hist, cv2.HISTCMP_CORREL)
            if difference < threshold:
                changes += 1
        previous_hist = hist
    return round(changes / (clip.duration / 60), 2)

def analyze_audio(clip):
    """
    Analyzes the average volume level of a video clip from its audio track.

    Parameters:
    - clip: Video object (for example, a MoviePy VideoFileClip) that contains an audio track.

    Process:
    - Extracts the clip's audio track and temporarily saves it in WAV format.
    - Loads the audio file at a sampling rate of 22050 Hz using librosa.
    - Computes the signal energy (RMS) over time.
    - Converts the RMS values to decibels (dB), normalized against the maximum value.
    - Computes the mean absolute volume in decibels.

    Returns:
    - float: Average volume level in decibels (dB), rounded to two decimals.
    """

    with tempfile.NamedTemporaryFile(suffix=".wav") as audio_temp:
        clip.audio.write_audiofile(audio_temp.name, verbose=False, logger=None)
        y, _ = librosa.load(audio_temp.name, sr=22050)
        rms = librosa.feature.rms(y=y)[0]
        volume_db = librosa.amplitude_to_db(rms, ref=np.max)
        return round(float(np.mean(np.abs(volume_db))), 2)

def compute_visual_complexity(clip, sample_frames=30):
    """
    Computes the average visual complexity of a video clip based on the number of contours detected in representative frames.

    Parameters:
    - clip: Video object (for example, a MoviePy VideoFileClip) from which frames will be extracted.
    - sample_frames (int): Number of equidistant frames analyzed throughout the video. Defaults to 30.

    Process:
    - Selects a series of equidistant times throughout the clip's duration.
    - For each time, extracts a frame and resizes it to 320x180 pixels.
    - Converts the frame to grayscale and applies a Gaussian blur to reduce noise.
    - Detects edges in the frame using the Canny algorithm.
    - Finds contours in the resulting image.
    - Counts the number of contours as a measure of visual complexity and accumulates it.

    Returns:
    - float: Average number of contours detected per frame, as an indicator of the video's visual complexity, rounded to two decimals.
    """

    complexities = []
    for t in np.linspace(0, clip.duration, sample_frames):
        frame = cv2.resize(clip.get_frame(t), (320, 180))
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 100, 200)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        complexities.append(len(contours))
    return round(float(np.mean(complexities)), 2)

def compute_sound_density(clip):
    """
    Computes the sound density of a video clip, understood as the number of significant sound events per minute.

    Parameters:
    - clip: Video object (for example, a MoviePy VideoFileClip) that contains an audio track.

    Process:
    - Extracts the clip's audio track and temporarily saves it in WAV format.
    - Loads the audio file at a sampling rate of 22050 Hz using librosa.
    - Computes the energy envelope to detect the presence of sound events.
    - Detects the energy peaks (onsets) in the audio signal.
    - Filters the events to remove detections that are very close to each other, considering a minimum interval of 1 second between events.
    - Counts the filtered events as indicators of relevant sounds.

    Returns:
    - float: Sound event density per minute in the clip, rounded to two decimals.
    """

    with tempfile.NamedTemporaryFile(suffix=".wav") as audio_temp:
        clip.audio.write_audiofile(audio_temp.name, verbose=False, logger=None)
        y, sr = librosa.load(audio_temp.name, sr=22050)
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        peaks = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, units='time', backtrack=True, delta=0.7, wait=2)
        filtered_sounds = []
        last_sound = -np.inf
        min_interval = 1.0
        for peak in peaks:
            if peak - last_sound >= min_interval:
                filtered_sounds.append(peak)
                last_sound = peak
        duration_min = clip.duration / 60
        return round(len(filtered_sounds) / duration_min, 2)

def classify_interval(cuts, volume, complexity, sound_density):
    for age_range, params in AGE_PARAMETERS.items():
        if (cuts <= params['cuts'] and volume <= params['volume'] and
            complexity <= params['visual_complexity'] and sound_density <= params['sound_density']):
            return age_range
    return "13+"

def generate_report(interval_analysis):
    counts = {"0-3": 0, "4-6": 0, "7-12": 0, "13+": 0}

    for interval in interval_analysis:
        counts[interval['age']] += 1

    final_age = max(counts, key=counts.get)
    text = f"Overall recommended age: {final_age}\n\n"

    return final_age, text, interval_analysis

def analyze_video(video_path, interval_duration=60):
    clip = mp.VideoFileClip(video_path)
    interval_results = []
    intervals = np.arange(0, clip.duration, interval_duration)
    total = len(intervals)
    progress = st.progress(0)

    for idx, start in enumerate(intervals):
        end = min(start + interval_duration, clip.duration)
        subclip = clip.subclip(start, end)

        progress.progress(10, "Detecting visual cuts...")
        cuts = detect_cuts(subclip)
        progress.progress(40, "Analyzing audio volume...")
        volume = analyze_audio(subclip)
        progress.progress(60, "Computing visual complexity...")
        complexity = compute_visual_complexity(subclip)
        progress.progress(80, "Computing sound density...")
        density = compute_sound_density(subclip)

        age = classify_interval(cuts, volume, complexity, density)

        interval_results.append({
            'start': start,
            'end': end,
            'cuts': cuts,
            'volume': volume,
            'complexity': complexity,
            'sound_density': density,
            'age': age
        })

        progress.progress((idx + 1) / total, f"Analyzing intervals ({idx+1}/{total})...")

    progress.empty()
    return generate_report(interval_results)

def plot_chart(intervals):
    df = pd.DataFrame(intervals)
    fig, ax = plt.subplots(figsize=(6, 4))
    x = [f"{int(i['start'])}-{int(i['end'])}" for i in intervals]
    ax.plot(x, df['cuts'], label="Visual cuts/min", marker='o')
    ax.plot(x, df['complexity'], label="Visual complexity", marker='o')
    ax.plot(x, df['volume'], label="Average volume (dB)", marker='o')
    ax.plot(x, df['sound_density'], label="Sound density", marker='o')
    ax.set_xlabel("Intervals (s)")
    ax.set_ylabel("Value")
    ax.set_title("Indicator trend")
    ax.legend()
    plt.xticks(rotation=45)
    plt.tight_layout()
    st.pyplot(fig)

def show_summary(intervals):
    df = pd.DataFrame(intervals)

    st.markdown("### 📌 Visual summary of metrics")

    metrics = [
        ("Visual cuts/min (max)", df['cuts'].max(), "#20D86A"),
        ("Visual complexity (max)", df['complexity'].max(), "#6a4c93"),
        ("Average volume (dB)", df['volume'].max(), "#f39c12"),
        ("Sound density (max)", df['sound_density'].max(), "#e74c3c")
    ]

    col1, col2 = st.columns(2)
    for i, (title, value, color) in enumerate(metrics):
        target_col = col1 if i % 2 == 0 else col2
        with target_col:
            st.markdown(f"""
                <div style="
                    background-color: {color};
                    padding: 20px;
                    border-radius: 15px;
                    color: white;
                    margin-bottom: 15px;
                    text-align: center;
                    box-shadow: 0 4px 8px rgba(0,0,0,0.15);
                ">
                    <div style="font-size: 0.9em;">{title}</div>
                    <div style="font-size: 2em; font-weight: bold;">{value}</div>
                </div>
            """, unsafe_allow_html=True)
