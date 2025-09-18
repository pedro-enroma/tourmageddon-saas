Traceback (most recent call last):
  File "/Users/pedromartinezsaro/Desktop/tourmageddon-saas/update_status_from_csv.py", line 5, in <module>
    df = pd.read_csv(file_path)
  File "/Users/pedromartinezsaro/Library/Python/3.9/lib/python/site-packages/pandas/io/parsers/readers.py", line 1026, in read_csv
    return _read(filepath_or_buffer, kwds)
  File "/Users/pedromartinezsaro/Library/Python/3.9/lib/python/site-packages/pandas/io/parsers/readers.py", line 620, in _read
    parser = TextFileReader(filepath_or_buffer, **kwds)
  File "/Users/pedromartinezsaro/Library/Python/3.9/lib/python/site-packages/pandas/io/parsers/readers.py", line 1620, in __init__
    self._engine = self._make_engine(f, self.engine)
  File "/Users/pedromartinezsaro/Library/Python/3.9/lib/python/site-packages/pandas/io/parsers/readers.py", line 1898, in _make_engine
    return mapping[engine](f, **self.options)
  File "/Users/pedromartinezsaro/Library/Python/3.9/lib/python/site-packages/pandas/io/parsers/c_parser_wrapper.py", line 93, in __init__
    self._reader = parsers.TextReader(src, **kwds)
  File "pandas/_libs/parsers.pyx", line 574, in pandas._libs.parsers.TextReader.__cinit__
  File "pandas/_libs/parsers.pyx", line 663, in pandas._libs.parsers.TextReader._get_header
  File "pandas/_libs/parsers.pyx", line 874, in pandas._libs.parsers.TextReader._tokenize_rows
  File "pandas/_libs/parsers.pyx", line 891, in pandas._libs.parsers.TextReader._check_tokenize_status
  File "pandas/_libs/parsers.pyx", line 2053, in pandas._libs.parsers.raise_parser_error
UnicodeDecodeError: 'utf-8' codec can't decode byte 0xf1 in position 496: invalid continuation byte
