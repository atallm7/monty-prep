"""Record lesson narration with the Kokoro voice (free, runs on CPU).

Reads lessons/scripts.json (made by scripts/lesson-audio/export.cjs), renders every lesson in this
shard that has no up-to-date recording in public/lessons/, and writes <id>-<hash>.mp3 plus <id>.json
(slide and caption timings) into --out.

  python scripts/lesson-audio/render.py --model kokoro-v1.0.int8.onnx --voices voices-v1.0.bin \
      --shard 0 --of 1 --out out [--only q0008,q0012]
"""
import argparse, json, os, subprocess, sys, time
import numpy as np
from kokoro_onnx import Kokoro

VOICE, SPEED, SR = "af_heart", 1.05, 24000
LEAD, GAP_CHUNK, GAP_SLIDE = 0.3, 0.3, 0.75

ap = argparse.ArgumentParser()
ap.add_argument("--model", required=True); ap.add_argument("--voices", required=True)
ap.add_argument("--scripts", default="lessons/scripts.json"); ap.add_argument("--have", default="public/lessons")
ap.add_argument("--shard", type=int, default=0); ap.add_argument("--of", type=int, default=1)
ap.add_argument("--out", default="out"); ap.add_argument("--only", default="")
a = ap.parse_args()

scripts = json.load(open(a.scripts))
only = set(x for x in a.only.split(",") if x)
todo = [s for i, s in enumerate(scripts) if i % a.of == a.shard and (not only or s["id"] in only)]

def up_to_date(s):
    p = os.path.join(a.have, s["id"] + ".json")
    if not os.path.exists(p): return False
    try:
        j = json.load(open(p))
        return j.get("hash") == s["hash"] and j.get("voice") == VOICE and os.path.exists(os.path.join(a.have, j["url"]))
    except Exception: return False

todo = [s for s in todo if not up_to_date(s)]
print(f"shard {a.shard}/{a.of}: {len(todo)} lessons to record", flush=True)
os.makedirs(a.out, exist_ok=True)
k = Kokoro(a.model, a.voices)
zeros = lambda sec: np.zeros(int(SR * sec), dtype=np.float32)
t0 = time.time()
for n, s in enumerate(todo):
    parts, t, slides = [zeros(LEAD)], LEAD, []
    for si, chunks in enumerate(s["slides"]):
        if si: parts.append(zeros(GAP_SLIDE)); t += GAP_SLIDE
        start, cs = t, []
        for ci, c in enumerate(chunks):
            if ci: parts.append(zeros(GAP_CHUNK)); t += GAP_CHUNK
            audio, sr = k.create(c, voice=VOICE, speed=SPEED, lang="en-us")
            assert sr == SR, sr
            cs.append([round(t, 2), c]); parts.append(audio.astype(np.float32)); t += len(audio) / SR
        slides.append({"start": round(start, 2), "chunks": cs})
    pcm = (np.clip(np.concatenate(parts + [zeros(0.4)]), -1, 1) * 32767).astype("<i2").tobytes()
    name = f"{s['id']}-{s['hash']}.mp3"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-",
                    "-c:a", "libmp3lame", "-b:a", "24k", os.path.join(a.out, name)], input=pcm, check=True)
    json.dump({"hash": s["hash"], "voice": VOICE, "url": name, "dur": round(t + 0.4, 2), "slides": slides},
              open(os.path.join(a.out, s["id"] + ".json"), "w"), separators=(",", ":"))
    print(f"[{n + 1}/{len(todo)}] {s['id']} {t:.0f}s audio, {time.time() - t0:.0f}s elapsed", flush=True)
