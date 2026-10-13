"""Local subtitle evidence only. No cloud inference and no transcript supplied as a prompt."""
import argparse
import hashlib
import json
import os
from pathlib import Path

os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
ROOT = Path(__file__).resolve().parent.parent
MODEL = ROOT / '.local' / 'voice-models' / 'faster-whisper-small'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--prepare-model', action='store_true')
    parser.add_argument('--input', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--model-dir', type=Path, default=MODEL)
    args = parser.parse_args()
    if args.prepare_model:
        from huggingface_hub import HfApi, snapshot_download
        revision = HfApi().model_info('Systran/faster-whisper-small', token=False).sha
        snapshot_download('Systran/faster-whisper-small', revision=revision, local_dir=MODEL, token=False,
                          allow_patterns=['config.json', 'model.bin', 'tokenizer.json', 'vocabulary.txt'])
        assert all((MODEL / name).is_file() for name in ['config.json', 'model.bin', 'tokenizer.json', 'vocabulary.txt'])
        manifest = {'repository': 'Systran/faster-whisper-small', 'revision': revision, 'files': {
            p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in MODEL.iterdir() if p.is_file() and p.name != 'source-manifest.json'}}
        target = MODEL / 'source-manifest.json'
        target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        assert json.loads(target.read_text(encoding='utf-8')) == manifest
        print(json.dumps({'modelPrepared': True, 'revision': revision, 'paidCalls': 0}))
        return
    if not args.input or not args.output:
        parser.error('--input and --output required')
    if not args.input.is_file() or args.input.stat().st_size > 64 * 1024 * 1024:
        raise ValueError('Local media missing or too large')
    from faster_whisper import WhisperModel
    from opencc import OpenCC
    simplified = OpenCC('t2s').convert
    model = WhisperModel(str(args.model_dir), device='cpu', compute_type='int8', cpu_threads=4, local_files_only=True)
    segments, info = model.transcribe(str(args.input), language='zh', beam_size=5, word_timestamps=True,
                                     vad_filter=True, condition_on_previous_text=False)
    rows = [{'start': s.start, 'end': s.end, 'text': simplified(s.text), 'originalText': s.text, 'avgLogProbability': s.avg_logprob,
             'noSpeechProbability': s.no_speech_prob, 'words': [
                 {'start': w.start, 'end': w.end, 'text': simplified(w.word), 'originalText': w.word, 'probability': w.probability}
                 for w in (s.words or [])]} for s in segments]
    result = {'sourceSha256': hashlib.sha256(args.input.read_bytes()).hexdigest(), 'engine': 'faster-whisper 1.2.1 small CPU int8',
              'durationSec': info.duration, 'language': info.language, 'segments': rows,
              'text': ''.join(row['text'] for row in rows), 'requiresReview': True, 'paidCalls': 0}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    assert json.loads(args.output.read_text(encoding='utf-8')) == result
    print(json.dumps({'segments': len(rows), 'durationSec': info.duration, 'paidCalls': 0}))

if __name__ == '__main__':
    main()
