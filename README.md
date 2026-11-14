# Deadline Dynamics

**A project management simulator built on system dynamics research.**
Designed and built by Dr. Rajan Kumar V K, D.Sc. (Industrial Engineering and Management).

Run a project month by month. Hire people, push overtime, invest in testing, decide how far project phases overlap, and answer change requests from the client. Status reports look fine for a while, but the rework nobody can see yet is what decides how the project ends. At the end, a debrief shows what really drove the result.

## Scenarios

| Project | Sector | Difficulty | Scope | Deadline |
|---|---|---|---|---|
| Mobile Banking App | Software | Moderate | 2,500 features | 12 months |
| Packaging Line Retrofit | Manufacturing | Moderate | 1,750 work packages | 10 months |
| Distribution Warehouse | Construction | Hard | 3,800 work packages | 14 months |
| Digital Twin Rollout | Industry 4.0 | Hard | 2,200 tasks | 12 months |

All companies, products and people in the scenarios are fictional.

## How it works

The engine (`js/engine.js`) is a system dynamics model integrated in weekly steps with monthly decisions. Its stocks are work to do, work done correctly, undiscovered rework, experienced staff, new staff, staff in recruitment, fatigue and cost. Key feedback structures:

- **Rework cycle:** part of all work is flawed, is counted as done, and surfaces weeks later as rework.
- **Fatigue:** overtime raises output at once, but fatigue builds and raises error rates and resignations.
- **Brooks' law:** new hires arrive after a delay, work slower, make more errors and take mentoring time.
- **Reviews and testing:** cost capacity, but catch errors early and shorten the time flaws stay hidden.
- **Concurrency:** overlapping phases is faster, but flaws found later knock out more downstream work.

Scores cover schedule (30%), budget (20%), quality (20%), stakeholders (15%) and team health (15%). The model is deterministic, so the same decisions always give the same result.

### References

Abdel-Hamid, T. K., & Madnick, S. E. (1991). *Software project dynamics: An integrated approach*. Prentice Hall.

Brooks, F. P. (1975). *The mythical man-month: Essays on software engineering*. Addison-Wesley.

Cooper, K. G. (1980). Naval ship production: A claim settled and a framework built. *Interfaces, 10*(6), 20–36. https://doi.org/10.1287/inte.10.6.20

Ford, D. N., & Sterman, J. D. (1998). Dynamic modeling of product development processes. *System Dynamics Review, 14*(1), 31–68.

Lyneis, J. M., & Ford, D. N. (2007). System dynamics applied to project management: A survey, assessment, and directions for future research. *System Dynamics Review, 23*(2–3), 157–189. https://doi.org/10.1002/sdr.377

Sterman, J. D. (2000). *Business dynamics: Systems thinking and modeling for a complex world*. Irwin/McGraw-Hill.

## Run it

No build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```
python -m http.server 8000
```

### Publish on GitHub Pages

1. Open the repository on GitHub and go to **Settings > Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
3. After a minute the game is live at `https://rajan56.github.io/ProjectManagementSimulation-RajanVK/`.

## Project structure

```
index.html        page shell
css/style.css     visual design
js/scenarios.js   scenario library
js/engine.js      simulation model, scoring and debrief logic
js/charts.js      small SVG chart helpers
js/app.js         user interface
```

## Copyright

© 2026 Rajan Kumar V K. All rights reserved. See [LICENSE](LICENSE).
