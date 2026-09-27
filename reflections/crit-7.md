# Crit 7

**What was the breakthrough that moved the work forward?**

The breakthrough was realising that I should stop thinking of the timetable as a sequence of user actions and start thinking of it as a persistent system state. A clash is not something that belongs to the latest request; it is a property of the timetable as a whole. From there, I also realised that a detected conflict is not necessarily an error that the system should force the user to fix. Separating the system's facts from the user's decisions — detecting conflicts independently from whether the user chooses to acknowledge them — gave the project a much clearer model and made the later features easier to reason about and test.

**What did this work change about who I want to be as a software developer?**

This work made me want to become a developer who thinks beyond making a feature work. I want to understand the state, assumptions, and user intent behind a system, and to use tests to challenge whether my implementation actually represents those ideas. I also learned that good engineering often comes from questioning an initial design rather than adding more code to it. In future projects, I want to be someone who can work with AI coding agents to move quickly, while still taking responsibility for the architecture, behaviour, and reasoning behind the code.
