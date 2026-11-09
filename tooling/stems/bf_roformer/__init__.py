"""Mel-Band RoFormer para dividir a voz em principal e backing vocals.

Copiado de audio-separator 0.48.0 (MIT, github.com/nomadkaraoke/python-audio-separator), que por sua
vez adapta lucidrains/BS-RoFormer (MIT); rotary_embedding_torch 0.6.5 (MIT, lucidrains). Mudanças:
importações locais e o decorador beartype trocado por um que não faz nada. Licenças em LICENSES.txt.
"""
from .mel_band_roformer import MelBandRoformer  # noqa: F401
