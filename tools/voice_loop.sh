#!/bin/sh
# Records every remaining Chatterbox line in batches, one fresh process per batch. Run from the project folder:
#   nohup caffeinate -i sh tools/voice_loop.sh > /dev/null 2>&1 &
# Stop it with:  pkill -f voice_loop.sh; pkill -f 83_make_voice_cb
LOG=01_data_tts/cb_run.log
while true; do
  .venv-cb/bin/python -u src/83_make_voice_cb.py --max 60 >> "$LOG" 2>&1
  code=$?
  [ "$code" = 10 ] && continue          # more lines left
  [ "$code" = 3 ] && sleep 300 && continue   # five failures in a row (memory): wait five minutes and try again
  break
done
echo "loop finished with code $code" >> "$LOG"
