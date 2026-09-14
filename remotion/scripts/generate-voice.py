import json, os, time, random, requests
from pathlib import Path

root=Path(__file__).resolve().parents[1]
texts=json.loads((root/'narration.json').read_text())
out=root/'public/audio'; out.mkdir(parents=True,exist_ok=True)
key=os.environ.get('LOVABLE_API_KEY')
if not key: raise SystemExit('LOVABLE_API_KEY is missing')
url='https://ai.gateway.lovable.dev/v1/audio/speech'
instructions=("Speak in warm East African English with a natural Ugandan character. "
 "Professional, calm and confident, with clear diction and measured documentary pacing. "
 "Respect punctuation and do not sound theatrical or urgent. Pronounce Allma as Al-mah, SOS as ess-oh-ess, and AI as ay-eye.")
for i,text in enumerate(texts,1):
    path=out/f'scene-{i:02d}.mp3'
    if path.exists() and path.stat().st_size>1000:
        print(f'{i:02d} cached'); continue
    payload={'model':'openai/gpt-4o-mini-tts','input':text,'voice':'alloy','instructions':instructions,'speed':0.9,'response_format':'mp3','stream_format':'audio'}
    for attempt in range(4):
        r=requests.post(url,headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'},json=payload,timeout=180)
        if r.ok:
            path.write_bytes(r.content); print(f'{i:02d} {len(r.content)} bytes'); break
        print(f'{i:02d} error {r.status_code}: {r.text[:300]}')
        if r.status_code not in (429,500,502,503,504): raise SystemExit(1)
        wait=float(r.headers.get('Retry-After',2**attempt*3))+random.random()
        time.sleep(wait)
    else: raise SystemExit(f'failed scene {i}')
    time.sleep(0.4)
