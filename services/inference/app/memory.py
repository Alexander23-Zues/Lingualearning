"""Return released CPU allocations to the operating system when supported."""
import ctypes
import gc
import sys

_trim_heap = getattr(ctypes.CDLL(None), "malloc_trim", None) if sys.platform == "linux" else None


def trim_memory():
    gc.collect()
    if _trim_heap is not None:
        _trim_heap(0)
