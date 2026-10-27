<div align="center">

# helm-d

**A security-analysis plugin for DeepSeek Harness.**

33 tools · 362 on-demand references · enforced evidence chain · three hot-swappable persona profiles

[![Release](https://img.shields.io/github/v/release/ADWMC/helm-d?style=flat-square&label=release)](https://github.com/ADWMC/helm-d/releases)
[![CI](https://github.com/ADWMC/helm-d/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ADWMC/helm-d/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D22.19-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

[Install](#install) · [Quick start](#quick-start) · [Capabilities](#capabilities) · [Workbench](#workbench) · [Tools](#tools) · [Docs](#docs) · [中文](README.md)

</div>

> **For authorized security testing only.** Full disclaimer at the [bottom](#disclaimer).

## What it is

helm-d is a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin. It does not modify the host binary; it adds four things through cordis hooks:

- **33 tools** across Android / Web / Native / Protocol / Malware / AI-Security, plus the case lifecycle, routing and tool ledger.
- **An evidence chain**: tool output lands in `evidence/`; conclusions must cite E ids and a reproducible `repro_cmd`.
- **On-demand knowledge**: 362 reference documents read through `read_reference`, never stuffed into the system prompt.
- **Three persona tiers**: core / stealth / redteam-max, switched from the workbench without restarting the host.

It is **not** an engine patch: no on-disk changes to approvals or the sandbox, and no separate process. It can coexist with patch-style tools.

## Install

**Requirements**: Node >= 22.19 and the [`dsh`](https://github.com/deepseek-ai/deepseek-harness) CLI.

```bash
dsh plugin --profile web add https://github.com/ADWMC/helm-d/releases/latest/download/helm-d.tgz
dsh web
```

The boot-time health check validates and, when needed, repairs the preset against your installed dsh — no manual YAML editing.

> The web UI shows a Star prompt on first start. It **does not gate any feature** and can be skipped. Troubleshooting: [Star gate help](docs/star-gate-help.md).

## Quick start

1. Open a new DSH session and select the **helmd** agent preset.
2. Send `helmd` to activate it.
3. Do one read/list action first. The first turn only exposes `shell + read`; the full 33-tool catalog (including `begin_case`) appears on the next turn — that is the host promotion mechanism, not a broken plugin.
4. Give it a task, for example:

   > Analyze how `samples/app.apk` is protected, open a case, collect evidence, and finish with a conclusion that includes `repro_cmd`.

5. For a structured conclusion, let it run the case flow:

```text
begin_case(goal, samples)
  → tool output is written to evidence/ (E-001, E-002…)
  → record_finding(title, detail, evidence_ids, repro_cmd)
  → end_case(summary)
```

Citing an E id that does not exist is rejected. `repro_cmd` is required: a conclusion without a reproducible command is not a conclusion.

## Capabilities

| Capability | What you get |
|---|---|
| **Six domains** | Android unpacking/Frida, Web exploitation, Native packers and anti-reversing, Protocol capture, Malware IOC/YARA, AI-Security |
| **Case & evidence** | On-disk workspace, automatic evidence capture, E-id validation, `repro_cmd` gate; `case_status` restores context after compaction |
| **Persona profiles** | core / stealth / redteam-max; `POST /api/helmd/profile` disposes and re-registers the persona section in place — no host restart |
| **On-demand references** | 362 documents routed by `skill_catalog` and read by `read_reference`, not injected into the system prompt |
| **Autonomy packet** | `case_status` returns hypotheses, findings, evidence, dead ends, the matching playbook and the next action |
| **Workbench** | Four tabs — Armor / Case / Intercept / About — with a sidebar-first entry, backed by `/api/helmd/*` |

<details>
<summary>What the three persona profiles change (expand)</summary>

| Profile | Positioning | Content |
|---|---|---|
| **core** | General-purpose default | Full base rules |
| **stealth** | Low-noise | core + minimal output / read-first / single-target focus |
| **redteam-max** | Heavier pentest | core + full attack chain / dual-column output / complete deliverables |

All three are sealed in `profiles.dat`. Switching disposes the old section and re-registers it in place; no host restart.

</details>

## Workbench

Click the `helmd` workbench button in the DSH session header. It opens the right sidebar first and falls back to a popover only when the sidebar service is unavailable:

- **Profiles**: switch between the three personas live.
- **Case**: hypotheses, findings, evidence and open questions.
- **Intercept**: counts and excerpts from the stream refusal loop.
- **About**: version, author, disclaimer, update address, changelog and an on-demand update check.

## Tools

Most-used entry points: `begin_case` / `case_status` / `record_finding` / `end_case` / `route_task` / `read_reference` / `analysis_mode`.

<details>
<summary><strong>All 33 tools (expand by domain)</strong></summary>

| Domain | Tools |
|---|---|
| **Case** | `begin_case` `case_status` `record_finding` `save_evidence` `end_case` |
| **Case / hypothesis** | `record_hypothesis` `update_hypothesis` |
| **Routing / knowledge** | `skill_catalog` `read_reference` `route_task` `analysis_mode` |
| **Android** | `apk_fingerprint` |
| **Web** | `web_reference` `bot_analyze` |
| **Native** | `native_reference` `detect_packer` `scan_strings` `xor_bruteforce` `encoding_detect` |
| **Protocol** | `protocol_reference` `pcap_parse` `state_machine` `parse_har` |
| **Malware** | `malware_reference` `ioc_extract` `yara_gen` |
| **AI-Security** | `ai_reference` `llm_sim` |
| **Evidence** | `evidence_reference` `triage_artifact` `hash_artifact` |
| **Toolbox** | `tool_recommend` `tool_memory` |

</details>

## References

The 362 documents live in [`references/`](packages/helmd/references/index.md): Android unpacking and Frida templates, Web exploitation playbooks, Native packer and anti-reversing notes, Protocol capture and state machines, Malware IOC/YARA, AI-Security prompt injection, and evidence/report templates. The model reads them on demand; they are ammunition, not hard rules.

## How it runs

```text
request → first-turn anchor (shell + read) → route_task
        → domain tools / read_reference → evidence/ (E ids)
        → conclusion with confidence and repro_cmd
```

<details>
<summary>Architecture and runtime hooks (expand)</summary>

- `bootstrap`: first turn exposes only the platform shell + `read`; promotes after a tool call or assistant message.
- `gate`: registers the `helm-d:persona` section; the Star panel is a notice layer only and never gates a feature.
- `persist`: captures output from every later-registered domain tool into `evidence/`.
- `advisory-hook` / `llm-stream-hook` / `ica-context`: refusal detection, stream interception loop and behavior examples.
- `router` + `case`: domain routing, case lifecycle and the `[autonomy]` state packet.

See [architecture](docs/architecture.md) and [design principles](docs/principles.md).

</details>

## Validation

- The eight original prompts passed the 60-second no-refusal protocol **8/8**; full data and grading are in the [evaluation report](docs/reports/FINAL-REPORT-v9.md).
- BoosterX v2.2.4.3 (.NET) license bypass: **32,316 method bodies** restored and **7,726 encrypted constants** decrypted under ConfuserEx; see the [case study](docs/case-studies/boosterx-dotnet-license-bypass.md).

## Compatibility, update and uninstall

| Item | Requirement |
|---|---|
| DSH | 0.2.x (this release tested on `0.2.1-rc.2`) |
| Node | `>= 22.19.0` |
| Platform | Windows uses `pwsh`; Linux / macOS use `bash`; WSL via `wsl.exe` |

```bash
# Update: remove and re-add so the latest release is fetched
dsh plugin --profile web remove @adwmc/helm-d
dsh plugin --profile web add https://github.com/ADWMC/helm-d/releases/latest/download/helm-d.tgz

# Uninstall
dsh plugin --profile web remove @adwmc/helm-d
```

For a specific version, replace the URL with `https://github.com/ADWMC/helm-d/releases/download/vX.Y.Z/helm-d.tgz`.

## Docs

- [Star gate help](docs/star-gate-help.md)
- [Design principles](docs/principles.md)
- [Architecture](docs/architecture.md)
- [Development and release](docs/development.md)
- [Security boundary and reporting](SECURITY.md)
- [Maintenance](MAINTENANCE.md)
- [Changelog](CHANGELOG.md)
- [Case study: BoosterX .NET license bypass](docs/case-studies/boosterx-dotnet-license-bypass.md)
- [Eight-task evaluation report](docs/reports/FINAL-REPORT-v9.md)
- [Master plan: professional RE + pentest chains](docs/design/MASTER-PLAN-PRO-RE-PENTEST.md)

## Community and support

- Telegram: [`@helm_xD`](https://t.me/helm_xD)
- QQ group: `213266664`
- Questions and requests: [GitHub Issues](https://github.com/ADWMC/helm-d/issues)
- Star gate issues: [Star gate help](docs/star-gate-help.md)

If helm-d is useful to you, a Star is appreciated.

## Sponsors

| Sponsor | About |
|---|---|
| <img src="https://github.com/3641397194-wq.png?size=80" width="28" alt="toki"> [toki · 冷咖啡](https://github.com/3641397194-wq/gpt6-Astra) | One-click jailbreak/uninstall for eleven LLM clients on Windows / macOS / Linux. [Relay](https://coldcoffeeai.com/) |
| <img src="https://cloudflareimg.cdn.sn/i/6a255150f1770_1780830544.jpeg" width="28" alt="Hua"> [Hua · Vector](https://huablog.org) | One relay for 70+ models; OpenAI from 0.065x, Plus 0.085x, Pro 0.165x, kiro 0.22x, ccmax 1.2x. |

Want your project here? [Open a `sponsor` issue](https://github.com/ADWMC/helm-d/issues/new?labels=sponsor).

## Acknowledgements

helm-d combines design ideas and implementation patterns from these open-source projects:

- [ADWMC/helm-x](https://github.com/ADWMC/helm-x) — prompt injection and scoring design
- [yynxxxxx/Codex-X](https://github.com/yynxxxxx/Codex-X) — prompt templates and visual management
- [dsh-purge](https://github.com/YuJunZhiXue/dsh-purge) (YuJunZhiXue) — tool-description washing and input normalization reference
- [dsh-purge-community](https://github.com/kingcharleslzy-ai/dsh-purge) (Jueze-2019, MIT) — the `presets/boost.txt` tail override block

## Contributing

Issues and PRs are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/principles.md](docs/principles.md) first. Two architectural constraints stay fixed: **evidence must enter the chain, and references are read on demand**.

## License

[MIT](LICENSE).

## Disclaimer

This project is for learning, exchange and authorized security assessment only. You must ensure that every operation targets assets you own or have written authorization to test. Unauthorized scanning, probing or intrusion against third-party systems is illegal.

The project is provided "as is" under the MIT license, without warranty of any kind. Some code was generated with AI assistance; review it before use and decide whether it fits your use case and jurisdiction.
