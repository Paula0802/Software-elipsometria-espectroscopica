"""
Utilidades generales para el software de elipsometría
"""

from .file_readers import (
    read_spe_file,
    read_spe_manual,
    read_optical_file
)

__all__ = [
    'read_spe_file',
    'read_spe_manual',
    'read_optical_file',
]