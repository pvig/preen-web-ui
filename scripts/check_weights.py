"""Check Keras 3 weight naming so we can fix the TF.js serializer."""
import os, sys, warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
warnings.filterwarnings('ignore')
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from scripts.train_cvae import build_encoder
enc = build_encoder()

print("=== Weight names in Keras 3 ===")
for layer in enc.layers[:5]:
    for w in layer.weights:
        print(f"  layer={layer.name!r}  w.name={w.name!r}  path={getattr(w, 'path', 'N/A')!r}")

print("\n=== model.weights sample (first 8) ===")
for w in enc.weights[:8]:
    print(f"  w.name={w.name!r}  path={getattr(w, 'path', 'N/A')!r}")
