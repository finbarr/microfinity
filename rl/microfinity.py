"""Gymnasium and PettingZoo adapters. Rules execute in the same QuickJS engine as rooms."""
from __future__ import annotations
import json
import pathlib
import subprocess
from functools import lru_cache

import gymnasium as gym
from gymnasium import spaces
import numpy as np
from pettingzoo import ParallelEnv, AECEnv

ROOT = pathlib.Path(__file__).resolve().parents[1]


def observation_space():
    # Fixed UTF-8 JSON byte buffer works with standard Gym/PettingZoo array consumers.
    return spaces.Box(low=0, high=255, shape=(65536,), dtype=np.uint8)


def encode(view):
    raw = json.dumps(view, ensure_ascii=True, separators=(",", ":"), sort_keys=True).encode("utf8")
    if len(raw) >= 65536:
        raise ValueError("Observation exceeds the documented 64 KiB byte space")
    out = np.zeros(65536, dtype=np.uint8)
    out[:len(raw)] = np.frombuffer(raw, dtype=np.uint8)
    return out


def decode(observation):
    return json.loads(observation.tobytes().rstrip(b"\0").decode("utf8"))


class Bridge:
    def __init__(self, game="toast-catch", players=None, difficulty=1, mode="native", action_repeat=12, max_decisions=2000, cartridge=None):
        self.process = subprocess.Popen(["node", "--import", "tsx", "scripts/rl-bridge.ts"], cwd=ROOT,
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        options = dict(difficulty=difficulty, mode=mode, actionRepeat=action_repeat, maxDecisions=max_decisions)
        if players is not None:
            options["players"] = players
        self.meta = self.call(method="load", game=game, options=options, cartridge=cartridge)["meta"]

    def call(self, **request):
        if self.process.poll() is not None:
            raise RuntimeError("Headless engine exited")
        self.process.stdin.write(json.dumps(request) + "\n")
        self.process.stdin.flush()
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError("Headless engine returned no response")
        response = json.loads(line)
        if "error" in response:
            raise RuntimeError(response["error"])
        return response.get("result", response)

    def close(self):
        if self.process.poll() is None:
            self.call(method="close")
            try:
                self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
        for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
            stream.close()


class MicrofinityEnv(gym.Env):
    metadata = {"render_modes": ["ansi"], "render_fps": 5}

    def __init__(self, game="toast-catch", render_mode=None, **options):
        self.bridge = Bridge(game=game, **options)
        self.action_space = spaces.Discrete(18)
        self.observation_space = observation_space()
        self.render_mode = render_mode
        self.view = ""

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        actual_seed = seed if seed is not None else int(self.np_random.integers(0, 2**32))
        result = self.bridge.call(method="reset", seed=actual_seed)
        self.view = encode(result["observations"]["p0"])
        return self.view, result["infos"]["p0"]

    def step(self, action):
        if not self.action_space.contains(action):
            raise ValueError("Invalid controller action")
        result = self.bridge.call(method="step", actions={"p0": int(action)})
        self.view = encode(result["observations"]["p0"])
        return self.view, result["rewards"]["p0"], result["terminated"], result["truncated"], result["infos"]["p0"]

    def render(self):
        return json.dumps(decode(self.view), indent=2) if self.render_mode == "ansi" else None

    def close(self):
        self.bridge.close()


class MicrofinityParallel(ParallelEnv):
    metadata = {"name": "microfinity_parallel_v1", "render_modes": []}

    def __init__(self, game="asteroid-scramble", players=2, **options):
        self.bridge = Bridge(game=game, players=players, **options)
        self.possible_agents = [f"p{i}" for i in range(players)]
        self.agents = []

    @lru_cache(maxsize=None)
    def observation_space(self, agent):
        return observation_space()

    @lru_cache(maxsize=None)
    def action_space(self, agent):
        return spaces.Discrete(18)

    def reset(self, seed=None, options=None):
        self.agents = self.possible_agents[:]
        result = self.bridge.call(method="reset", seed=int(seed if seed is not None else np.random.default_rng().integers(0, 2**32)))
        return {a: encode(v) for a, v in result["observations"].items()}, result["infos"]

    def step(self, actions):
        if not self.agents:
            return {}, {}, {}, {}, {}
        if set(actions) != set(self.agents):
            raise ValueError("Supply one controller action per live agent")
        result = self.bridge.call(method="step", actions={a: int(v) for a, v in actions.items()})
        terminations = {a: result["terminated"] for a in self.agents}
        truncations = {a: result["truncated"] for a in self.agents}
        observations = {a: encode(v) for a, v in result["observations"].items()}
        if result["terminated"] or result["truncated"]:
            self.agents = []
        return observations, result["rewards"], terminations, truncations, result["infos"]

    def close(self):
        self.bridge.close()


class MicrofinityAEC(AECEnv):
    """Actual cartridge turn selection, including repeated inputs within a placement turn."""
    metadata = {"name": "microfinity_aec_v1", "render_modes": [], "is_parallelizable": False}

    def __init__(self, game="patchwork-pass", players=2, **options):
        super().__init__()
        self.bridge = Bridge(game=game, players=players, **options)
        if self.bridge.meta["clock"] != "action":
            self.bridge.close()
            raise ValueError("AEC adapter requires an action-driven cartridge")
        self.possible_agents = [f"p{i}" for i in range(players)]
        self.agents = []

    @lru_cache(maxsize=None)
    def observation_space(self, agent):
        return observation_space()

    @lru_cache(maxsize=None)
    def action_space(self, agent):
        return spaces.Discrete(18)

    def reset(self, seed=None, options=None):
        self.agents = self.possible_agents[:]
        result = self.bridge.call(method="reset", seed=int(seed if seed is not None else np.random.default_rng().integers(0, 2**32)))
        self.rewards = {a: 0.0 for a in self.agents}
        self._cumulative_rewards = self.rewards.copy()
        self.terminations = {a: False for a in self.agents}
        self.truncations = self.terminations.copy()
        self.infos = result["infos"]
        self.views = result["observations"]
        self.agent_selection = next(a for a, role in result["roles"].items() if role != "waiting")

    def observe(self, agent):
        return encode(self.views[agent])

    def step(self, action):
        agent = self.agent_selection
        if self.terminations[agent] or self.truncations[agent]:
            self._was_dead_step(action)
            return
        if not self.action_space(agent).contains(action):
            raise ValueError("Invalid controller action")
        self._cumulative_rewards[agent] = 0
        self._clear_rewards()
        result = self.bridge.call(method="step", actions={agent: int(action)})
        self.rewards = result["rewards"]
        self.infos = result["infos"]
        self.views = result["observations"]
        self.terminations = {a: result["terminated"] for a in self.agents}
        self.truncations = {a: result["truncated"] for a in self.agents}
        self._accumulate_rewards()
        if result["terminated"] or result["truncated"]:
            self._deads_step_first()
        else:
            self.agent_selection = next(a for a, role in result["roles"].items() if role != "waiting")

    def close(self):
        self.bridge.close()
