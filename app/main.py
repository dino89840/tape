import os
import time
import logging
import secrets
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Form, HTTPException, Depends, status
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from . import db, streamtape

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("main")

# ---------- Basic auth ----------
WEB_USER = os.environ.get("WEB_USER", "admin")
WEB_PASS = os.environ.get("WEB_PASS", "changeme")
security = HTTPBasic()


def auth(creds: HTTPBasicCredentials = Depends(security)):
    ok_u = secrets.compare_digest(creds.username, WEB_USER)
    ok_p = secrets.compare_digest(creds.password, WEB_PASS)
    if not (ok_u and ok_p):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized",
            headers={"WWW-Authenticate": "Basic"},
        )
    return creds.username


# ---------- Scheduler ----------
scheduler = BackgroundScheduler(timezone="UTC")
SLEEP_BETWEEN = int(os.environ.get("SLEEP_BETWEEN_FILES", "3"))
# default = ၇ ရက် တစ်ခါ UTC 03:00
CRON_EXPR = os.environ.get("CRON_SCHEDULE", "0 3 */7 * *")


def run_touch_all(note: str = "scheduled"):
    files = db.list_files()
    run_id = db.start_run(note=f"{note} ({len(files)} files)")
    ok = fail = 0
    log.info(f"=== run start: {len(files)} files ({note}) ===")
    for f in files:
        fid = f["file_id"]
        res = streamtape.touch(fid)
        db.update_file_status(fid, res["status"], res["message"], res.get("name", ""))
        if res["status"] == "alive":
            ok += 1
        else:
            fail += 1
        time.sleep(SLEEP_BETWEEN)
    db.finish_run(run_id, ok, fail)
    log.info(f"=== run done: ok={ok} fail={fail} ===")
    return ok, fail


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    try:
        trigger = CronTrigger.from_crontab(CRON_EXPR)
        scheduler.add_job(run_touch_all, trigger, id="touch_all", replace_existing=True)
        scheduler.start()
        log.info(f"scheduler started with cron='{CRON_EXPR}'")
    except Exception as e:
        log.error(f"scheduler failed: {e}")
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(lifespan=lifespan, title="Streamtape Keeper")
templates = Jinja2Templates(directory="app/templates")


# ---------- Routes ----------
@app.get("/", response_class=HTMLResponse)
def index(request: Request, user: str = Depends(auth)):
    files = db.list_files()
    runs = db.recent_runs(5)
    next_run = None
    job = scheduler.get_job("touch_all")
    if job and job.next_run_time:
        next_run = job.next_run_time.strftime("%Y-%m-%d %H:%M UTC")
    return templates.TemplateResponse("index.html", {
        "request": request,
        "files": files,
        "runs": runs,
        "next_run": next_run,
        "cron": CRON_EXPR,
        "total": len(files),
        "alive": sum(1 for f in files if f["last_status"] == "alive"),
        "dead": sum(1 for f in files if f["last_status"] == "dead"),
    })


@app.post("/add")
def add(links: str = Form(...), user: str = Depends(auth)):
    added = skipped = invalid = 0
    for line in links.splitlines():
        line = line.strip()
        if not line:
            continue
        fid = streamtape.extract_file_id(line)
        if not fid:
            invalid += 1
            continue
        if db.add_file(fid):
            added += 1
        else:
            skipped += 1
    return RedirectResponse(f"/?added={added}&skipped={skipped}&invalid={invalid}", status_code=303)


@app.post("/delete/{file_id}")
def delete(file_id: str, user: str = Depends(auth)):
    db.remove_file(file_id)
    return RedirectResponse("/", status_code=303)


@app.post("/check/{file_id}")
def check_one(file_id: str, user: str = Depends(auth)):
    res = streamtape.touch(file_id)
    db.update_file_status(file_id, res["status"], res["message"], res.get("name", ""))
    return RedirectResponse("/", status_code=303)


@app.post("/check-all")
def check_all(user: str = Depends(auth)):
    # manual full run — async ဖြစ်အောင် scheduler ကို တခါတည်း trigger
    scheduler.add_job(run_touch_all, args=["manual"], id=f"manual-{int(time.time())}")
    return RedirectResponse("/?triggered=1", status_code=303)


@app.get("/api/files")
def api_files(user: str = Depends(auth)):
    return JSONResponse(db.list_files())


@app.get("/healthz")
def healthz():
    return {"ok": True}
