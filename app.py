import streamlit as st
import os
import yt_dlp
from core import analyze_video, plot_chart, show_summary

st.set_page_config(page_title="Kiddometer", page_icon="🎬", layout="wide")

# Modern, responsive visual style
st.markdown("""
<style>
    html, body {
        background-color: #0F0F0F;
        font-family: 'Poppins', sans-serif;
        color: #333333;
    }

    h1, h2, h3, h4 {
        color: #6a4c93;
    }

    .stButton button {
        background-color: #20D86A;
        color: white;
        font-weight: 600;
        border: none;
        border-radius: 10px;
        padding: 10px 20px;
    }

    .stButton button:hover {
        background-color: #00953C;
        color: white;
    }

    @media screen and (max-width: 768px) {
        .block-container {
            padding: 1rem;
        }
    }
</style>
""", unsafe_allow_html=True)

st.markdown("""
<h1 style='text-align:center;'>🎬 Kiddometer</h1>
<div style='text-align:center; font-size:1.1em; margin-bottom:1em;'>
Analyze videos and get a science-based age recommendation for your children.
</div>
""", unsafe_allow_html=True)

if "processing" not in st.session_state:
    st.session_state["processing"] = False
if "video_path" not in st.session_state:
    st.session_state["video_path"] = None

if not st.session_state["processing"] and st.session_state["video_path"] is None:
    with st.container():
        st.subheader("🔹 Upload or enter a video")
        cols = st.columns([1, 1])
        with cols[0]:
            video_file = st.file_uploader("🎞️ Upload a file (max 200MB)", type=["mp4", "mov", "avi"])
        with cols[1]:
            video_url = st.text_input("🌐 Or enter a URL (YouTube/Vimeo):")

        if video_file:
            if video_file.size > 200 * 1024 * 1024:
                st.error("⚠️ The file exceeds 200 MB.")
            else:
                path = f"/tmp/{video_file.name}"
                with open(path, "wb") as f:
                    f.write(video_file.getbuffer())
                st.session_state["video_path"] = path
        elif video_url:
            path = "/tmp/downloaded_video.mp4"
            try:
                with st.spinner("Downloading video..."):
                    ydl_opts = {
                        'outtmpl': path,
                        'format': 'mp4[height<=480]',
                        'noplaylist': True,
                        'quiet': True
                    }
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.download([video_url])
                st.session_state["video_path"] = path
                st.success("✅ Video downloaded successfully.")
            except Exception as e:
                st.error(f"❌ Error: {e}")

if st.session_state["video_path"] and not st.session_state["processing"]:
    st.success("🎥 Video ready to analyze.")
    if st.button("🔍 Analyze video now"):
        st.session_state["processing"] = True
        st.rerun()

if st.session_state["processing"]:
    st.info("Processing the video, please wait...")
    age, report, intervals = analyze_video(st.session_state["video_path"])
    st.success("✅ Analysis complete!")

    st.markdown("<h2 style='text-align:center; color:#6a4c93;'>📊 Analysis result</h2>", unsafe_allow_html=True)
    col1, col2 = st.columns([2, 1])

    with col1:
        plot_chart(intervals)

    with col2:
        st.markdown(f"""
            <div style="background-color:#6a4c93; color:white; padding:1em; border-radius:10px; text-align:center;">
                <h3>📌 Recommended age: {age}</h3>
            </div>
        """, unsafe_allow_html=True)
        show_summary(intervals)

    if os.path.exists(st.session_state["video_path"]):
        os.remove(st.session_state["video_path"])

    st.session_state["video_path"] = None
    st.session_state["processing"] = False

    if st.button("🔁 Analyze another video"):
        st.session_state.clear()
        st.rerun()

st.markdown("---")
st.subheader("📌 General recommendations by age")
st.dataframe({
    "Age": ["0–3", "4–6", "7–12", "13+"],
    "Visual cuts/min": ["<2", "2–4", "5–8", "8+"],
    "Visual complexity": ["<50", "50–100", "100–150", "150+"],
    "Average volume (dB)": ["<60", "60–70", "70–80", "80–85"],
    "Sound density (sounds/min)": ["<2", "2–4", "4–6", "6+"],
    "Daily screen time": ["Avoid", "1h", "1–2h", "Balanced"]
}, use_container_width=True)
st.markdown("Children under 6 are advised not to be exposed to screens, given their impact on neurological, emotional and social development at this age.")

st.markdown("---")
st.subheader("🔬 How do we analyze the content?")
col1, col2 = st.columns(2)

with col1:
    st.markdown("""
    ### 📌 1. Visual cuts per minute
    - Every second is analyzed.
    - The color histogram is compared between frames.
    - If the difference exceeds a certain threshold, it is considered a visual cut.
    - The average per minute is computed.

    ### 🎨 2. Visual complexity
    - Representative samples are taken.
    - Each frame is processed with edge detection.
    - The number of contours present is counted.
    """)

with col2:
    st.markdown("""
    ### 🔊 3. Average volume (dB)
    - The audio is extracted and its energy (RMS) is computed.
    - It is converted to decibels.
    - An average volume is obtained.

    ### 🎵 4. Sound density
    - Distinct auditory events ("onsets") are detected.
    - Very close sounds are filtered out.
    - The number of new sounds per minute is computed.
    """)

st.markdown("---")
st.markdown("### 📚 Reference scientific studies")

st.markdown("""
1. **WHO (2019)**: Recommendation of at most 1h of daily screen time for children under 5. [See study](https://apps.who.int/iris/handle/10665/311664)
2. **AAP (2020)**: Avoid screens before 18 months. Educational and limited content between ages 2 and 5. [See study](https://publications.aap.org/pediatrics/article/138/5/e20162591/60321/Media-and-Young-Minds)
3. **Christakis (2011)**: Fast-paced videos linked to attention deficit. [See study](https://doi.org/10.1542/peds.2011-2071)
4. **UNICEF (2021)**: They require slow content and real relationships. [See study](https://www.unicef.org/reports/state-worlds-children-2017)
5. **CPS (2019)**: At most 1h daily of slow, supervised content. [See study](https://cps.ca/en/documents/position/screen-time-and-young-children)
6. **Gentile et al. (2017)**: Violent videos raise cortisol in children. [See study](https://jamanetwork.com/journals/jamapediatrics/fullarticle/2612159)
7. **WHO (2018)**: Risk of digital addiction from excessive exposure. [See study](https://www.who.int/news-room/questions-and-answers/item/addictive-behaviours-gaming-disorder)
""")
