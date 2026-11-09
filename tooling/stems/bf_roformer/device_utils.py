"""Equivalentes mínimos de audio_separator/separator/uvr_lib_v5/device_utils.py (CPU e CUDA)."""
from contextlib import nullcontext

import torch


def autocast_disabled(device: torch.device):
    if device.type not in ("cuda", "cpu"):
        return nullcontext()
    return torch.autocast(device_type=device.type, enabled=False)


def should_fallback_to_cpu_for_complex_ops(device: torch.device) -> bool:
    # Só usado em MPS (Mac); no Windows (CPU/CUDA) as operações complexas rodam no próprio dispositivo.
    return device.type == "mps"
