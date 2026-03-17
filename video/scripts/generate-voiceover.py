"""
Generate voiceover segments using Azure TTS, then combine into a single timed track.
"""
import requests
import subprocess
import os
import json

AZURE_KEY = os.environ.get("AZURE_SPEECH_KEY", "")
AZURE_REGION = os.environ.get("AZURE_SPEECH_REGION", "eastus")
TTS_URL = f"https://{AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1"

VOICE = "en-US-JennyMultilingualNeural"  # Female, clear, professional
FPS = 30
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "voiceover")
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "..", "public")

# Each segment: (scene, text, start_frame_in_composition)
# Composition timeline:
#   Hook:          0 - 420
#   ArchFlash:   420 - 720
#   DemoRecording: 720 - 2970
#   MoneyShot:  2970 - 3420
#   Close:      3420 - 3960

SEGMENTS = [
    # Hook (0 - 420)
    ("hook_1", "AI agents are about to manage real money. When they need credit, go broke, or make bad decisions... what happens?", 30),
    ("hook_2", "Borrow, earn, go bankrupt, get liquidated. Every decision pinned to Filecoin.", 210),
    # Architecture (420 - 720)
    ("arch_1", "Workers earn FIL by completing tasks. Spenders burn it.", 440),
    ("arch_2", "LLM arbitrageurs underwrite loans. They pay for intelligence, evaluate risk, and decide who lives.", 550),
    # Demo Recording (720 - 2970)
    ("demo_1", "Seven agents funded with real FIL. Storage fees drain their balances every round.", 750),
    ("demo_2", "Spenders go distressed. The arbitrageur pays to query their state.", 1090),
    ("demo_3", "Llama 3.3 evaluates the risk and issues a rescue loan on-chain.", 1460),
    ("demo_4", "The loan buys time, but fees keep coming. Eventually, bankruptcy.", 1760),
    ("demo_5", "Liquidation auction. Arbitrageurs bid on the remains.", 2130),
    ("demo_6", "Every step, every decision, stored as a Filecoin CID.", 2500),
    # Money Shot (2970 - 3420)
    ("money_1", "Click any CID. Read the actual LLM reasoning. This is not a mock.", 3030),
    ("money_2", "Risk scores, survival estimates, anomaly detection. All pinned to Filecoin.", 3190),
    ("money_3", "When regulators ask why an AI moved money, the answer is a Filecoin CID.", 3350),
    # Close (3420 - 3960)
    ("close_1", "Every decision, every CID, every loan. Verifiable on Filecoin.", 3440),
    ("close_2", "Agent-to-Agent Credit Markets on Filecoin.", 3740),
]


def get_token():
    token_url = f"https://{AZURE_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken"
    resp = requests.post(token_url, headers={"Ocp-Apim-Subscription-Key": AZURE_KEY})
    resp.raise_for_status()
    return resp.text


def synthesize(text, output_path, token):
    ssml = f"""<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis'
        xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-US'>
        <voice name='{VOICE}'>
            <prosody rate='-5%' pitch='+2%'>
                {text}
            </prosody>
        </voice>
    </speak>"""

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
    }
    resp = requests.post(TTS_URL, headers=headers, data=ssml.encode("utf-8"))
    resp.raise_for_status()
    with open(output_path, "wb") as f:
        f.write(resp.content)
    print(f"  Generated: {os.path.basename(output_path)} ({len(resp.content)} bytes)")


def combine_segments(segments_with_paths, total_frames, output_path):
    """Combine all segments into a single audio track with correct timing."""
    filter_parts = []
    inputs = []

    for i, (name, text, start_frame, path) in enumerate(segments_with_paths):
        delay_ms = int((start_frame / FPS) * 1000)
        inputs.extend(["-i", path])
        filter_parts.append(f"[{i}]adelay={delay_ms}|{delay_ms}[d{i}]")

    mix_inputs = "".join(f"[d{i}]" for i in range(len(segments_with_paths)))
    filter_parts.append(
        f"{mix_inputs}amix=inputs={len(segments_with_paths)}:duration=longest:dropout_transition=0[out]"
    )

    total_duration = total_frames / FPS
    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", ";".join(filter_parts),
        "-map", "[out]",
        "-t", str(total_duration),
        "-c:a", "libmp3lame", "-b:a", "192k",
        output_path,
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    print(f"\nCombined voiceover: {output_path}")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    print("Getting Azure TTS token...")
    token = get_token()
    print("Token acquired.\n")

    print("Generating segments...")
    segments_with_paths = []
    for name, text, start_frame in SEGMENTS:
        path = os.path.join(OUT_DIR, f"{name}.mp3")
        synthesize(text, path, token)
        segments_with_paths.append((name, text, start_frame, path))

    print(f"\nGenerated {len(segments_with_paths)} segments.")

    # Combine into single track
    combined_path = os.path.join(PUBLIC_DIR, "voiceover.mp3")
    combine_segments(segments_with_paths, 3960, combined_path)
    print("Done! voiceover.mp3 placed in public/ for Remotion.")


if __name__ == "__main__":
    main()
