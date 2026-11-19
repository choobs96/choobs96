# Idea: Agent Substrate (parked 2026-11-19)

**Status:** parked. Jian plans to come back to it soon. When this is picked up, start with "Next steps" below.

## What it is
- Repo: https://github.com/agent-substrate/substrate (Apache 2.0, v1.0, Google-backed; kagent, a CNCF project, uses it).
- Zero-trust runtime that runs very large numbers of AI agents ("actors") on Kubernetes.
  - Idle agents are snapshotted (memory and files) and use no hardware.
  - A request resumes the agent onto any free warm worker pod in under 500 ms, with 10–30× more agents than pods.
  - Every agent runs in a gVisor or microVM sandbox with its own SPIFFE identity and default-deny networking.
  - **No credentials inside the sandbox.** The egress gateway (`atenet-egress`) adds them to approved outbound requests.
- Docs worth reading: `docs/concepts/architecture.md`, `docs/security/security.md`, `demos/claude-code-multiplex/`.

## Explainer figure
- Published (private): https://claude.ai/artifact/XGvuvqEJU5dvhLJUC8HJTQ, "Agent Substrate Bench".
- A cartridge library: rack = snapshotted agents, drives = warm worker pods, gantry picker = resume/suspend, EGRESS lockbox = credential gateway.
- Source: `figure-build.mjs`, built with the Anatomy skill (github.com/wheresryan22/anatomy at commit 1482e84). Clone that to `~/skills-src/anatomy`, then run `node figure-build.mjs` (add `--light` for the light theme).

## Verdict
Not useful for Jian's personal setup (one person using Claude Code; it needs a Kubernetes cluster and a platform team). The ideas are useful now, and the software matters if work builds an agent for each analyst or customer.

## Three ways to use it
1. **Borrow the ideas now:**
   - Credential-free agents: keys live in environment network secrets or a gateway, never in the agent.
   - Idle-by-default agents: scheduled checks such as dbt runs or Kafka lag that wake, report and sleep.
2. **Pitch it at work:** one sandboxed agent per analyst or customer over the semantic layer, with warehouse tokens kept out of agents and access policy and data-loss checks at the gateway. A platform team owns the Kubernetes side; Jian owns the data-access rules and the semantic layer.
3. **Hands-on:** the `kind` quickstart (counter demo). It can't run in a Claude cloud session (no Docker daemon, and gVisor needs privileges). Use a local machine with Docker, or a GKE trial cluster.

## Next steps (offered, not started)
- [ ] Write a "credential-free agent" skill for `choobs96/claude-code-skills`.
- [ ] Draft a one-page pitch for the team.
- [ ] Optionally, add the figure to the portfolio site as a sample explainer.
