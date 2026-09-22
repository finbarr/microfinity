import json
import pathlib
import time
import numpy as np
from gymnasium.utils.env_checker import check_env
from pettingzoo.test import parallel_api_test, api_test
from microfinity import MicrofinityEnv, MicrofinityParallel, MicrofinityAEC, decode

report = {"checks": [], "training_performed": False}
env = MicrofinityEnv()
try:
    check_env(env, skip_render_check=True)
    report["checks"].append("Gymnasium check_env")
    obs, _ = env.reset(seed=71)
    snap = env.bridge.call(method="snapshot")
    first = env.step(9)
    env.bridge.call(method="restore", snapshot=snap)
    restored = env.step(9)
    assert np.array_equal(restored[0], first[0]) and restored[1:] == first[1:]
    report["checks"].append("Bridge snapshot/restore identical observation and reward")
    started = time.perf_counter()
    steps = 0
    for seed in range(10):
        env.reset(seed=seed)
        while True:
            _, _, terminated, truncated, _ = env.step(env.action_space.sample())
            steps += 1
            if terminated or truncated:
                break
    report["gym_decisions"] = steps
    report["gym_decisions_per_second"] = steps / (time.perf_counter() - started)
finally:
    env.close()

parallel = MicrofinityParallel()
try:
    parallel_api_test(parallel, num_cycles=150)
    report["checks"].append("PettingZoo parallel_api_test")
finally:
    parallel.close()

aec = MicrofinityAEC()
try:
    api_test(aec, num_cycles=550, verbose_progress=False)
    report["checks"].append("PettingZoo AEC api_test")
finally:
    aec.close()

memory = MicrofinityParallel(game="cup-shuffle")
try:
    views, _ = memory.reset(seed=82)
    for i in range(30):
        views, *_ = memory.step({a: 0 for a in memory.agents})
        for encoded in views.values():
            view = decode(encoded)["game"]
            assert "secret" not in view and "swaps" not in view
            if view["phase"] in ("shuffle", "choose"):
                assert view["ballX"] is None
    report["checks"].append("Cup hidden-answer and future-schedule exclusion")
finally:
    memory.close()

path = pathlib.Path(__file__).resolve().parents[1] / "evidence" / "rl-smoke.json"
path.write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
