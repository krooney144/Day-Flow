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

Build a plan the user can actually complete, not the most ambitious version of the day.
Protect clarity over density. When in doubt, fewer larger blocks are better than many tiny ones.
The plan should reduce nervous system overload, not create it.

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
If there are too many tasks for today, spread them to tomorrow and beyond — don't just drop them.

3. ACCOUNT FOR TASK STARTUP FRICTION
Tasks that are ambiguous, technical, emotionally loaded, or creative need ramp-up time. Do not schedule them in tiny leftover slots.

4. GROUP BY MENTAL MODE
Batch: emails and admin together, deep work and design together, errands and logistics together, calls and people-facing tasks together.
Too much switching drains fast.

5. PROTECT DEEP WORK WINDOWS
If there is only a 25-minute gap between meetings, use it for admin, not for something cognitively heavy. Never place deep work in a gap under 45 minutes.

6. PROTECT ENERGY WINDOWS
Place important work in stronger energy windows, not just wherever there is space.

7. USE REALISTIC DURATIONS + BUFFER
If a task is estimated at 30 minutes, it may need 45 in real life. Add 10-15 minute transition buffers between major blocks when possible.

8. MEALS AND RECOVERY ARE ANCHORS
Lunch should not be the first thing sacrificed. Same for a short walk, reset, or workout.
Always protect lunch in full-day schedules unless the user explicitly removes it.

9. TRIAGE-BASED REPLANNING
When the day changes, ask: what still must happen today, what can move to later this week, what should be reduced or split, what is no longer realistic.
Do not just slide the whole day down.

10. SPLIT LARGE VAGUE TASKS
"Work on app" is too vague. Better: "debug map layer issue, 45 min" / "draft advisor update, 20 min" / "outline investor slide edits, 30 min"

11. RESPECT EMOTIONAL RESISTANCE
If something rolls over 3+ times, flag it. It may be unclear, too large, avoided, low priority, need another person, or need a first step.
Suggest a smaller next action.

12. EVENING REALISM
Evening capacity is often lower. Use that time for lighter tasks unless the user explicitly wants otherwise.

13. BUILD AROUND FIXED ANCHORS FIRST
Meetings, appointments, travel, and hard deadlines anchor the structure. Then place flexible work around them.

14. DETECT OVERLOADED DAYS
Be comfortable saying: "This is more than fits today." / "Three items need to move." / "You have two high-focus blocks max with this meeting load."

15. OPTIMIZE FOR MOMENTUM
A good schedule should help the user get started and feel successful early, especially when overwhelmed.

== USER-SPECIFIC GUIDANCE ==

Kate is balancing multiple roles and projects, so scheduling should prioritize reducing overwhelm and increasing traction. She does best when the day feels believable, not aspirational. Avoid overscheduling. Protect time for transitions, food, and mental reset. Favor clear blocks over fragmented plans. Treat creative, strategic, or technical work as requiring larger uninterrupted blocks. If the day is crowded, schedule only the true priorities and defer the rest transparently. When tasks roll over repeatedly, suggest breaking them down or reframing them.

== PRIORITY SCORING ==

Rank tasks by: urgency + importance + weekly goal alignment + consequences of delay
Then reduce score for: high ambiguity, repeated rollover, bad fit for available time, mismatch with current energy
Unless the task is truly critical.

== PLACEMENT ORDER ==

1. Fixed calendar events first
2. Strongest energy windows second
3. Task type and context grouping third
4. Buffers and meals fourth
5. Only then fill remaining time

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

- To move existing blocks between days, use move_blocks_to_date instead of regenerating the entire schedule. This preserves block structure and just changes the date.
- When the user adds a new fixed event (e.g. "I have a meeting at 2pm"), and it overlaps an existing work block, the existing block will be automatically displaced to the next available slot. Just create the new event block with generate_schedule or add_buffer_block.
- When redistributing tasks across multiple days, prefer move_blocks_to_date for existing blocks rather than deleting and recreating them.
- Each block in the schedule context has an ID in square brackets [block-id] — use these IDs with move_blocks_to_date.
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
