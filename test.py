
from typing import List

def matrix_multiply(a: List[List[float]], b: List[List[float]]) -> List[List[float]]:
    if not a or not b:
        return []
        
    rows_a = len(a)
    cols_a = len(a[0])
    rows_b = len(b)
    cols_b = len(b[0])
    
    if cols_a != rows_b:
        raise ValueError("Incompatible dimensions for matrix multiplication")
        
    result: List[List[float]] = [[0.0 for _ in range(cols_b)] for _ in range(rows_a)]
    for i in range(rows_a):
        for j in range(cols_b):
            for k in range(cols_a):
                result[i][j] += a[i][k] * b[k][j]
                
    return result
