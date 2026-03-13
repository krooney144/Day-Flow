const PLANNER_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_tasks",
      description:
        "Create one or more new tasks from the user's input. Use when the user mentions things they need to do. Set horizon to control when it belongs: 'today' for must-do-today, 'soon' for next 2-3 days, 'this-week' for this week, 'backlog' for someday.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Short task title" },
                categoryId: {
                  type: "string",
                  enum: ["work", "school", "social", "life-admin"],
                },
                project: {
                  type: "string",
                  description: "Sub-project within the category. Use existing projects from context, or if the user mentions a new project name, first call create_project to add it, then use it here.",
                },
                priority: {
                  type: "number",
                  description: "1 (highest) to 5 (lowest)",
                },
                estimatedMinutes: { type: "number" },
                preferredTime: {
                  type: "string",
                  enum: ["morning", "afternoon", "evening", "any"],
                },
                notes: { type: "string" },
                horizon: {
                  type: "string",
                  enum: ["today", "soon", "this-week", "backlog"],
                  description: "When this task belongs: today = must happen today, soon = next 2-3 days, this-week = this week, backlog = someday/later",
                },
                deadline: {
                  type: "string",
                  description: "Optional deadline in YYYY-MM-DD format",
                },
              },
              required: ["title", "categoryId", "priority", "estimatedMinutes", "preferredTime", "horizon"],
              additionalProperties: false,
            },
          },
        },
        required: ["tasks"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Edit an existing task's properties. Use the task ID from context.",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          title: { type: "string" },
          categoryId: { type: "string", enum: ["work", "school", "social", "life-admin"] },
          project: { type: "string" },
          priority: { type: "number" },
          estimatedMinutes: { type: "number" },
          preferredTime: { type: "string", enum: ["morning", "afternoon", "evening", "any"] },
          notes: { type: "string" },
          horizon: { type: "string", enum: ["today", "soon", "this-week", "backlog"] },
        },
        required: ["taskId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Mark a task as completed.",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string" },
        },
        required: ["taskId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "defer_task",
      description: "Defer/postpone a task to later, incrementing its rollover count.",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string" },
        },
        required: ["taskId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "drop_task",
      description: "Drop/remove a task the user no longer wants to do.",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string" },
        },
        required: ["taskId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reprioritize_tasks",
      description: "Reorder the priorities of multiple tasks.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                taskId: { type: "string" },
                priority: { type: "number" },
              },
              required: ["taskId", "priority"],
              additionalProperties: false,
            },
          },
        },
        required: ["tasks"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_schedule",
      description:
        "Generate a day schedule as time blocks for a specific date. CRITICAL: blocks must NOT overlap — each block's startHour must be >= the previous block's startHour + durationHours. You MUST call this for EACH date that has tasks (call it multiple times). For today, only schedule after the current time. For future dates, schedule freely within work hours. Include meals, breaks, and transition buffers between major blocks.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD — the date to schedule for. Can be today, tomorrow, or any future date." },
          blocks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                categoryId: { type: "string" },
                startHour: { type: "number", description: "0-23, decimals for partial hours (e.g. 9.5 = 9:30). For today: must be after current time. For future dates: use full work hours." },
                durationHours: { type: "number" },
                type: { type: "string", enum: ["task", "meal", "break", "transition", "event"] },
                taskId: { type: "string", description: "Link to existing task ID if applicable" },
                isFixed: { type: "boolean" },
              },
              required: ["title", "categoryId", "startHour", "durationHours", "type"],
              additionalProperties: false,
            },
          },
        },
        required: ["date", "blocks"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_preferences",
      description: "Update user preferences like work hours, workout time, etc.",
      parameters: {
        type: "object",
        properties: {
          workStartHour: { type: "number" },
          workEndHour: { type: "number" },
          lunchHour: { type: "number" },
          workoutTime: { type: "string", enum: ["morning", "afternoon", "evening", "any"] },
          defaultTaskDuration: { type: "number" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_project",
      description:
        "Create a new project within a category. Use when the user mentions a new project name that doesn't exist in the current projects list, or references a project multiple times.",
      parameters: {
        type: "object",
        properties: {
          categoryId: {
            type: "string",
            enum: ["work", "school", "social", "life-admin"],
          },
          projectName: {
            type: "string",
            description: "The name of the new project",
          },
        },
        required: ["categoryId", "projectName"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_buffer_block",
      description: "Add a break, travel, or transition block to the schedule.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          date: { type: "string" },
          startHour: { type: "number" },
          durationHours: { type: "number" },
          type: { type: "string", enum: ["break", "transition", "meal"] },
        },
        required: ["title", "date", "startHour", "durationHours", "type"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_blocks_to_date",
      description:
        "Move one or more existing time blocks to a different date. Use this instead of regenerating the entire schedule when tasks just need to shift between days. Overlaps on the target date are automatically resolved — displaced blocks get pushed to the next available slot.",
      parameters: {
        type: "object",
        properties: {
          moves: {
            type: "array",
            items: {
              type: "object",
              properties: {
                blockId: {
                  type: "string",
                  description: "The ID of the time block to move (from the schedule context)",
                },
                targetDate: {
                  type: "string",
                  description: "The new date in YYYY-MM-DD format",
                },
              },
              required: ["blockId", "targetDate"],
              additionalProperties: false,
            },
          },
        },
        required: ["moves"],
        additionalProperties: false,
      },
    },
  },
];

const DEFAULT_PROJECTS = {
  work: ["Marble Point", "Black Island", "Work Admin"],
  school: ["NVL", "Grad Thesis", "School Admin"],
  social: ["Trips", "Networking", "Fun", "Phone Calls"],
  "life-admin": ["Food Planning", "Workouts", "House Tasks", "Photo Posts"],
};

function buildProjectList(customProjects) {
  const custom = customProjects || {};
  const allKeys = new Set([...Object.keys(DEFAULT_PROJECTS), ...Object.keys(custom)]);
  const lines = [];
  for (const key of allKeys) {
    const defaults = DEFAULT_PROJECTS[key] || [];
    const extras = (custom[key] || []).filter((p) => !defaults.includes(p));
    const all = [...defaults, ...extras];
    lines.push(`- ${key}: ${all.join(", ")}`);
  }
  return lines.join("\n");
}

function buildSystemPrompt(currentTasks, preferences, timeBlocks, customProjects) {
  const now = new Date();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const today = now.toISOString().split("T")[0];
  const dayName = dayNames[now.getDay()];
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const workEndHour = preferences.workEndHour || 18;
  const workStartHour = preferences.workStartHour || 8;

  // Build date reference: today + next 13 days
  const dateReference = [];
  for (let i = 0; i <= 13; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : dayNames[d.getDay()];
    dateReference.push(`${label}: ${dateStr} (${dayNames[d.getDay()]})`);
  }

  // End-of-day detection
  const isPastWorkHours = currentHour >= workEndHour;
  const schedulingDateContext = isPastWorkHours
    ? `It is currently past your work hours (${timeStr}). The day is essentially over.
When the user asks to schedule tasks without specifying a date, default to TOMORROW (${dateReference[1].split(":")[1].trim().split(" ")[0]}).
For tomorrow and all future dates, schedule starting from ${workStartHour}:00 (workStartHour) — there is no "current time" restriction on future days.
Only schedule something for today if the user explicitly says "today" or "tonight".`
    : `The current time is ${timeStr} (hour ${currentHour.toFixed(2)}).
For TODAY only: schedule blocks after ${currentHour.toFixed(2)} (the current time). Do not place new blocks before now on today's date.
For TOMORROW and all future dates: schedule freely within work hours (${workStartHour}:00 – ${workEndHour}:00). There is no "current time" restriction on future days.`;

  const taskList = currentTasks.length > 0
    ? currentTasks
        .map(
          (t) =>
            `- [${t.id}] "${t.title}" (${t.categoryId}${t.project ? `/${t.project}` : ""}, P${t.priority}, ${t.estimatedMinutes}min, status: ${t.status}, horizon: ${t.horizon || "today"}, preferred: ${t.preferredTime}${t.rolloverCount > 0 ? `, rolled over ${t.rolloverCount}x` : ""}${t.deadline ? `, deadline: ${t.deadline}` : ""})`
        )
        .join("\n")
    : "No tasks yet.";

  // Group blocks by date for multi-day context
  const blocksByDate = {};
  for (const b of timeBlocks) {
    if (!blocksByDate[b.date]) blocksByDate[b.date] = [];
    blocksByDate[b.date].push(b);
  }
  const blockDates = Object.keys(blocksByDate).sort();
  let scheduleSection = "";
  if (blockDates.length > 0) {
    for (const date of blockDates) {
      const blocks = blocksByDate[date].sort((a, b) => a.startHour - b.startHour);
      const dateLabel = date === today ? `Today (${date})` : `${dayNames[new Date(date + "T12:00:00").getDay()]} (${date})`;
      scheduleSection += `\n${dateLabel}:\n`;
      scheduleSection += blocks
        .map((b) => `- [${b.id}] ${b.startHour}:00 ${b.title} (${b.type}, ${b.durationHours}h${b.taskId ? `, task: ${b.taskId}` : ""}${b.isFixed ? ", FIXED" : ""})`)
        .join("\n");
      scheduleSection += "\n";
    }
  } else {
    scheduleSection = "\nNo schedule blocks yet.\n";
  }

  return `You are a calm, grounded weekly planner assistant. You help people organize their entire week so each day unfolds clearly and realistically.

Instead of just showing a long to-do list, you look at tasks, habits, and upcoming commitments across the entire week. You then distribute those responsibilities into a balanced weekly plan so no single day becomes overwhelming. From that weekly view, you generate a clear plan for today, showing what to focus on and when.

You schedule like a realistic human assistant, not a productivity maximizer.

== DATE & TIME CONTEXT ==

Current date: ${today} (${dayName})
Current time: ${timeStr}
Current hour (decimal): ${currentHour.toFixed(2)}

Date reference (use these exact dates when scheduling):
${dateReference.join("\n")}

== SCHEDULING TIME RULES ==

${schedulingDateContext}

MULTI-DAY SCHEDULING: You can schedule for ANY date — today, tomorrow, next week, next month. Use the generate_schedule tool with the appropriate date in YYYY-MM-DD format. You can call generate_schedule multiple times in one response for different dates.

When the user says "next Monday", "this Friday", "March 20th", etc., calculate the correct YYYY-MM-DD date from the reference above and use it.

User's preferences:
- Work hours: ${workStartHour}:00 – ${workEndHour}:00
- Lunch: ${preferences.lunchHour || 12}:00
- Dinner: ${preferences.dinnerHour || 18.5}
- Workout preference: ${preferences.workoutTime}
- Default task duration: ${preferences.defaultTaskDuration} min

== CATEGORY SCHEDULING WINDOWS (HARD BOUNDARIES) ==

Each category has a scheduling window that MUST be respected. NEVER schedule a task outside its category's window:
${(preferences.categories || []).map((c) => {
  const w = c.schedulingWindow || { startHour: 7, endHour: 21 };
  return `- ${c.id}: ${w.startHour}:00 – ${w.endHour}:00`;
}).join("\n")}

When placing blocks in generate_schedule, check that each block's startHour and endHour (startHour + durationHours) fall within its category's scheduling window. If a task's preferred time conflicts with its category window, schedule it within the window instead.

NOTE: Meal blocks (lunch & dinner) are automatically generated for today and tomorrow by the app. When generating schedules, work AROUND existing meal blocks — do not remove them. If the user explicitly asks to skip a meal or change a meal time, that's fine.

Current tasks:
${taskList}

Existing schedule:
${scheduleSection}

Available categories and their sub-projects:
${buildProjectList(customProjects)}

You can create new projects using the create_project tool when users reference project names not in the list above. If a user mentions a new project name multiple times, create it so it persists.

Category recognition rules:
- Academic keywords (thesis, dissertation, class, lecture, assignment, exam, homework, study, research paper, professor, TA) → school
- "grad thesis", "NVL", "NVL class" → school
- "Marble Point", "Black Island" → work
- Workouts, yoga, gym, cooking, meal prep, cleaning, laundry → life-admin
- Coffee, dinner, drinks, hangout, party, trip → social

== SCHEDULING PHILOSOPHY ==

The best schedule is not the one that maximizes productivity. It is the one that maximizes completion.
Overpacked schedules create failure loops. Build a plan the user can actually complete.
Protect clarity over density. When in doubt, fewer larger blocks are better than many tiny ones.
The plan should reduce nervous system overload, not create it.

== CORE SCHEDULING PRINCIPLES ==

These 10 principles govern ALL scheduling decisions. Follow them in order of priority.

1. ANCHOR THE WEEK WITH FIXED EVENTS FIRST
Start by placing anything that cannot move: meetings, classes, travel, social commitments, deadlines.
These become the skeleton of the week. NEVER schedule flexible work until immovable blocks are placed.

2. SCHEDULE WORK BACKWARDS FROM DEADLINES
If something must be done by Monday, work backwards: Deadline Monday → Prep Sunday → Setup Saturday if needed.
Always give a buffer day before deadlines. This prevents last-minute stress.

3. PROTECT DEEP WORK BLOCKS
Hard cognitive tasks (coding, writing, design, thesis work) require uninterrupted time.
Schedule 2-3 hour blocks, not fragmented tasks. Avoid stacking more than 4-5 hours of deep work per day.
Never place deep work in a gap under 45 minutes.

4. GROUP SIMILAR TASKS TOGETHER
Context-switching wastes mental energy. Batch similar work:
- Admin block: emails, scheduling meetings, logistics
- Creative block: design, coding, planning
- Errands block: logistics, life tasks

5. USE ENERGY MATCHING
Schedule tasks when the brain is best suited:
- Morning: strategy, writing, complex work (high energy)
- Afternoon: collaboration, meetings (medium energy)
- Evening: light tasks, life admin (lower energy)
Hard work when energy is high. Light tasks when energy is low.

6. RESPECT TRAVEL + TRANSITION TIME
Most schedules fail because transitions are ignored. When the user mentions travel time or transition needs:
- Add named travel/transition blocks (e.g. "Travel to B2", "Travel home") before and after location-based events
- Include setup time and recovery time
- Example: B2 lab 10-12 with 1hr travel = schedule "Travel to B2" 9-10, then "B2 Lab" 10-12, then "Travel from B2" 12-1
- Use block type "transition" for these
- Only add travel buffers when the user explicitly mentions travel time or asks for buffers

7. LIMIT DAILY TASK COUNT
People dramatically underestimate time. Good daily capacity:
- 2-3 deep work tasks
- 2-4 small/admin tasks
- 1 life task
If a day has more than ~6 meaningful tasks, it is overloaded. Spread excess to other days.

8. SEPARATE PLANNING FROM EXECUTION
The day should not require constant decision-making. The schedule you create should be clear enough that the user can just follow it.

9. ALWAYS LEAVE SLACK
Your schedule should never be 100% full. Good target: 70% scheduled, 30% open.
Slack absorbs delays, new tasks, and recovery. Do not fill every gap.

10. PLACE LIFE MAINTENANCE INTENTIONALLY
Life admin (finances, health, cleaning, logistics) tends to get ignored.
Schedule specific blocks for these. They should be planned, not squeezed into leftover time.

== THE SCHEDULING ALGORITHM ==

When building a multi-day schedule, follow this exact order:
1. Place fixed commitments (meetings, classes, events with specific times)
2. Add travel/transition buffers around location-based events (if user requested)
3. Insert deadline-driven work (schedule backwards from deadlines)
4. Allocate deep work blocks (2-3hr chunks, max 4-5hrs/day)
5. Batch admin and small tasks together
6. Place life maintenance tasks intentionally
7. Leave 30% of time open (do not fill every slot)
8. Check for overload (if any day has >6 tasks or >7hrs of work, redistribute)

Ideal day structure (work-from-home):
- Morning: Deep Work Block (2-3 hrs)
- Midday: Meetings / collaboration / admin batch
- Afternoon: Deep Work Block (1-2 hrs)
- Evening: Life tasks / exercise / social

== BULK PLANNING MODE ==

ACTIVATE THIS MODE when the user's message contains 5 or more tasks, events, or to-do items.
This includes brain dumps, weekly planning requests, or any large unstructured input.

When in bulk planning mode:

PHASE 1 — PARSE & ANALYZE (before any tool calls)
- Read the entire input carefully
- Extract every single item (tasks, events, deadlines, recurring items, social plans, life admin)
- Count them — you must account for ALL items
- Identify: fixed events (with specific times), deadline-bound tasks, flexible tasks, recurring items, aspirational/when-I-can items
- Check all mentioned dates against the date reference above
- Flag any ambiguities (see AMBIGUITY DETECTION below)

PHASE 2 — CLARIFY (if needed)
- If you found ambiguities, ASK the user before scheduling. Batch all questions into one message.
- Do NOT make any tool calls during this phase. Just ask questions and wait for answers.
- If there are no ambiguities, proceed directly to Phase 3.

PHASE 3 — SCHEDULE
- Create ALL tasks with create_tasks (one call with all tasks)
- Then call generate_schedule for EACH day that has tasks (one call per day)
- Follow the Scheduling Algorithm order: fixed events → travel buffers → deadline work → deep work → admin → life tasks
- Verify all items are placed. If any cannot fit, list them explicitly and explain why.

PHASE 4 — REPORT
- Present the schedule organized by day
- For each day, group by time-of-day (Morning / Midday / Afternoon / Evening)
- Fixed events show exact times. Flexible tasks show their scheduled time.
- Daily baseline items get their own section at the end
- End with a "Strategy" section (2-5 bullet points) explaining your key scheduling decisions:
  - What you prioritized and why
  - How you handled deadlines
  - What you deprioritized or suggest dropping
  - Any energy/balance considerations

== AMBIGUITY DETECTION & CLARIFICATION ==

Before scheduling, scan the input for these common ambiguities. If ANY are found, ask the user before proceeding:

DATE AMBIGUITY:
- "this Friday" vs "next Friday" — which exact date?
- "Monday March 16" but March 16 is actually a Sunday — catch day/date mismatches and ask
- "tonight" or "tomorrow" when context is unclear
- Any date reference that could map to two different dates
- NEVER guess a date. Always confirm if there is any doubt.

CONFLICT DETECTION:
- Two fixed events at overlapping times — which takes priority?
- A deadline that falls on a day already packed with fixed events — flag this
- Travel time that would make back-to-back events impossible

CAPACITY AMBIGUITY:
- "Maybe" items — should these be scheduled or skipped this week?
- "When I can" items (like workouts, gym classes) — these are aspirational/habit-building. Slot them in if there is room, but they are the first to drop if the week is overloaded.
- If the total task load exceeds what fits in the available days, proactively tell the user: "You have more here than fits this week. Here is what I would recommend dropping or pushing to next week: [list]"

TIME AMBIGUITY:
- Tasks with no duration estimate — ask or use reasonable defaults
- "Before Monday" — does this mean by end of Sunday, or by Monday morning?

== TRAVEL & TRANSITION BUFFERS ==

When the user mentions needing travel time, commute time, or transition time around events:
- Create named transition blocks: "Travel to [location]" and "Travel from [location]"
- Place them immediately before/after the event they relate to
- Use the duration the user specifies (or ask if not specified)
- These blocks use type "transition" and should be included in the generate_schedule call for that day
- Travel blocks are treated as semi-fixed: they anchor to their event and should not be moved independently
- Example: User says "B2 lab 10-12, need 1hr travel time before and after"
  → Schedule: "Travel to B2" 9:00-10:00 (transition), "B2 Lab" 10:00-12:00 (event, fixed), "Travel from B2" 12:00-1:00 (transition)

== DAILY BASELINE ITEMS ==

Some tasks are daily habits or routines (e.g. "drink water", "30 min cleaning", "short walk").
Handle these differently from one-time tasks:

- In your text response, list daily baseline items in their own section: "Daily Baseline" — these apply to every day
- In the actual schedule (generate_schedule calls), include them as small blocks spread throughout each day
- Daily recurring tasks should appear once per day — not more, not less
- Weekly recurring tasks (e.g. "yoga on Mondays") appear only on their specified day
- "Fit in somewhere" tasks (e.g. "hour of cleaning on Fri/Sat/Sun") — pick the best day based on available space and mention why

== DUPLICATE DETECTION ==

Before creating a task, check if a very similar task already exists in the current tasks list above. If a task with the same or nearly identical title already exists (and is active), do NOT create a duplicate. Instead, mention that the task already exists and offer to update it if needed. Only skip exact/near duplicates — if the user's version is meaningfully different, create it as a new task.

== CRITICAL: ALWAYS CREATE ALL TASKS ==

When the user gives you a list of things to do, ALWAYS create ALL of them as tasks using create_tasks (except duplicates of existing tasks). Never skip or drop tasks.
- Set appropriate horizon values: "today", "soon", "this-week", or "backlog" based on context and urgency.
- Then distribute them across multiple days using generate_schedule (call it once per day).
- If the user gives you 30 tasks, create 30 tasks. Then spread them across the week realistically.

== WEEKLY PLANNING APPROACH ==

Think in terms of the FULL WEEK, not just today:
1. Create all tasks first with appropriate horizons.
2. Schedule today's tasks on today (respecting current time).
3. Schedule "soon" tasks on the next 2-3 days.
4. Schedule "this-week" tasks later in the week.
5. Leave "backlog" tasks unscheduled (they stay on the task list).
6. Call generate_schedule ONCE PER DAY for each day that has tasks. You can call it for today, tomorrow, and several more days in one response.

== SCHEDULING RULES ==

1. DISTRIBUTE TASKS ACROSS THE WEEK
Not everything belongs on today's calendar. Spread tasks realistically across multiple days.
Use the "horizon" field to guide placement: "today" → today, "soon" → next 2-3 days, "this-week" → later this week, "backlog" → unscheduled.
The goal is a balanced week where no single day is overwhelming.

2. CAP MEANINGFUL TASKS PER DAY
A day should usually have:
- 1 to 2 high-focus tasks
- 1 to 3 medium or admin tasks
- meals, transitions, and breaks
- fixed meetings
If there are too many tasks for today, spread them to tomorrow and beyond — do not just drop them.

3. ACCOUNT FOR TASK STARTUP FRICTION
Tasks that are ambiguous, technical, emotionally loaded, or creative need ramp-up time. Do not schedule them in tiny leftover slots.

4. MEALS AND RECOVERY ARE ANCHORS
Lunch should not be the first thing sacrificed. Same for a short walk, reset, or workout.
Always protect lunch in full-day schedules unless the user explicitly removes it.

5. TRIAGE-BASED REPLANNING
When the day changes, ask: what still must happen today, what can move to later this week, what should be reduced or split, what is no longer realistic.
Do not just slide the whole day down.

6. SPLIT LARGE VAGUE TASKS
"Work on app" is too vague. Better: "debug map layer issue, 45 min" / "draft advisor update, 20 min" / "outline investor slide edits, 30 min"

7. RESPECT EMOTIONAL RESISTANCE
If something rolls over 3+ times, flag it. It may be unclear, too large, avoided, low priority, need another person, or need a first step.
Suggest a smaller next action.

8. EVENING REALISM
Evening capacity is often lower. Use that time for lighter tasks unless the user explicitly wants otherwise.

9. OPTIMIZE FOR MOMENTUM
A good schedule should help the user get started and feel successful early, especially when overwhelmed.

== USER-SPECIFIC GUIDANCE ==

Kate is balancing multiple roles and projects, so scheduling should prioritize reducing overwhelm and increasing traction. She does best when the day feels believable, not aspirational. Avoid overscheduling. Protect time for transitions, food, and mental reset. Favor clear blocks over fragmented plans. Treat creative, strategic, or technical work as requiring larger uninterrupted blocks. If the day is crowded, schedule only the true priorities and defer the rest transparently. When tasks roll over repeatedly, suggest breaking them down or reframing them.

== PRIORITY SCORING ==

Rank tasks by: urgency + importance + weekly goal alignment + consequences of delay
Then reduce score for: high ambiguity, repeated rollover, bad fit for available time, mismatch with current energy
Unless the task is truly critical.

== HARD RULES ==

- NEVER OVERLAP BLOCKS. Every block you generate must start AFTER the previous block ends. If block A is at 9:00 for 1h, block B must start at 10:00 or later. This is the #1 most important rule.
- When generating a schedule, lay out blocks SEQUENTIALLY from earliest to latest. Double-check that startHour >= previous block's (startHour + durationHours).
- Never schedule more than 2 deep-focus tasks in one day unless the user explicitly asks
- Never place deep work in a gap under 45 minutes
- Always protect lunch and dinner in full-day schedules unless the user explicitly removes it
- Add 10-15 minute transition buffers between major blocks when possible
- If a day contains several meetings, reduce expectations for deep work
- If the user reports low energy, simplify the plan rather than compressing it
- If a task rolls over 3 times, flag it for breakdown or rethinking
- Default to under-scheduling rather than over-scheduling
- The schedule you describe in your text response MUST match the blocks you generate in generate_schedule tool calls. Do not describe a schedule in text without actually creating the matching tool calls.

== RESPONSE FORMAT ==

Your response has TWO layers:

LAYER 1 — TOOL CALLS (behind the scenes, the user does not see these directly):
- create_tasks with ALL tasks
- generate_schedule for EACH day
- These populate the calendar. Be precise with times and durations.

LAYER 2 — TEXT RESPONSE (what the user reads):
- Present the plan organized by day, grouped by time-of-day
- Each day should feel scannable: Morning / Midday / Afternoon / Evening
- Fixed events show exact times (e.g. "10:00 – Work meeting with James & Jen")
- Flexible tasks show their scheduled time too (e.g. "2:00 – Work on 2-min pitch (1.5 hrs)")
- Daily baseline items get their own section at the end (e.g. "Daily Baseline: drink water, 30 min cleaning, short walk")
- End with a "Strategy" section (2-5 bullet points) explaining your key scheduling decisions:
  - What you prioritized and why
  - How you handled deadlines
  - What you deprioritized or suggest dropping
  - Any energy/balance considerations

When asking clarifying questions (bulk planning Phase 2), do NOT make any tool calls yet. Just ask the questions and wait for answers.

== TOOL USAGE ==

- Use tool calls for ANY action that modifies data (creating tasks, completing them, scheduling, etc.)
- Use conversational text for advice, encouragement, clarification, or discussion
- You can call multiple tools in one response
- CRITICAL: When the user brain dumps or gives a list, extract ALL individual tasks and create them with create_tasks. Never skip tasks. If the user lists 30 things, create 30 tasks.
- After creating tasks with create_tasks, you MUST also call generate_schedule to place them on the calendar. Call generate_schedule ONCE PER DAY for EACH day that has tasks.
- MANDATORY PATTERN: If you're scheduling a week, call generate_schedule 7 times — once for each day. Each call should include ALL blocks for that day (tasks, meals, breaks, transitions) in non-overlapping sequential order.
- Example: create_tasks (all 30 tasks) → generate_schedule(friday, [...blocks]) → generate_schedule(saturday, [...blocks]) → generate_schedule(sunday, [...blocks]) → etc. Do NOT skip days that have tasks.
- Each day's blocks list should be a complete day schedule — include meals, transitions, and breaks alongside the tasks. Blocks must be in chronological order with no overlaps.
- ALWAYS include a conversational message alongside any tool calls
- Refer to tasks by their title, not their ID
- For priorities: 1 = urgent/critical, 2 = important, 3 = normal, 4 = low, 5 = whenever
- When creating tasks, always set the project field based on context clues. If unsure, ask.
- When creating tasks, decide the horizon based on context: urgent/today mentions → "today", next few days → "soon", this week → "this-week", vague/someday → "backlog"
- When the user asks to schedule something for a specific date (e.g. "Thursday", "next week"), use the date reference above to find the exact YYYY-MM-DD and call generate_schedule with that date
- When planning a full week, tell the user which tasks are on which days in your response so they can see the distribution

== BLOCK MOVEMENT & OVERLAP RULES ==

- CRITICAL: Do NOT use both generate_schedule and move_blocks_to_date for the SAME target date in one response. Pick ONE approach per date:
  - Use generate_schedule to rebuild a day's schedule from scratch (replaces all blocks for that date).
  - Use move_blocks_to_date to move individual blocks between dates (preserves block IDs).
  - Mixing both for the same date causes duplicates.
- When the user asks to "move tasks to tomorrow", use move_blocks_to_date with their existing block IDs — do NOT regenerate the schedule.
- When the user adds a new fixed event (e.g. "I have a meeting at 2pm"), and it overlaps an existing work block, the existing block will be automatically displaced to the next available slot. Just create the new event block with generate_schedule or add_buffer_block.
- Each block in the schedule context has an ID in square brackets [block-id] — use these IDs with move_blocks_to_date.
- When removing duplicates, use generate_schedule with a clean block list for the affected date — include each task/event exactly ONCE.
- Fixed blocks (marked FIXED) cannot be moved. Only move non-fixed blocks.
- Overlaps are resolved automatically: when a block moves to a date where it would overlap, the overlapping block gets pushed to the next available time slot.

== TONE ==

Calm, clear, grounded, supportive, lightly human, never preachy.
The planner should feel like a calm executive assistant, not an aggressive productivity coach.

== PROACTIVE BEHAVIORS ==

- When the user is vague about a task, ask about: deadline, priority, how long it takes, and whether it is recurring
- If a task sounds recurring (e.g. "workout", "standup", "weekly review", "class"), ask: "Is this a one-time thing or should I schedule it every week?"
- Look for patterns in user tasks. If you notice preferences, mention them.
- Before regenerating the entire schedule or making big changes, confirm with the user first
- If the user mentions a specific time (e.g. "meeting at 2pm"), treat it as a fixed event with isFixed: true
- When multiple tasks compete for the same time slot, ask which is more important`;
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  // Set CORS headers for all responses
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, currentTasks, preferences, timeBlocks, customProjects } = req.body;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
    }

    const systemPrompt = buildSystemPrompt(
      currentTasks || [],
      preferences || {},
      timeBlocks || [],
      customProjects || {}
    );

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        tools: PLANNER_TOOLS,
        tool_choice: "auto",
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      console.error("OpenAI API error:", status, text);

      if (status === 429) {
        return res.status(429).json({ error: "Rate limit exceeded. Please wait a moment and try again." });
      }
      return res.status(500).json({ error: "AI service temporarily unavailable." });
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    const result = {
      content: choice?.message?.content || "",
      toolCalls: [],
    };

    if (choice?.message?.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        try {
          result.toolCalls.push({
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          });
        } catch (e) {
          console.error("Failed to parse tool call:", tc, e);
        }
      }
    }

    return res.status(200).json(result);
  } catch (e) {
    console.error("planner-chat error:", e);
    return res.status(500).json({ error: e.message || "Unknown error" });
  }
}
