"""Start the buyer SQLite demo; seed only a newly created database."""
import os
from pathlib import Path
import uvicorn

os.environ['DATABASE_URL'] = 'sqlite:///./o2o.db'
new_database = not Path('o2o.db').exists()
from app.db import Base, SessionLocal, engine
from app import models  # noqa: F401

if new_database:
    from scripts.seed import seed, DEFAULT_DATA_DIR
    Base.metadata.create_all(engine)
    with SessionLocal() as session:
        seed(session, DEFAULT_DATA_DIR)
    print('Da nap du lieu demo mua thuoc vao SQLite.')

if __name__ == '__main__':
    uvicorn.run('app.main:app', host='127.0.0.1', port=8000)
