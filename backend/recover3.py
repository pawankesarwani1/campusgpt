import os
import re
import json

transcript_path = r'C:\Users\aman kesarwani201\.gemini\antigravity\brain\7fc3a4f2-81e7-4949-8731-56ea88b7e315\.system_generated\logs\transcript_full.jsonl'
file_contents = {}

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        if 'File Path: ile:///' in line:
            try:
                step = json.loads(line)
            except:
                continue
            
            raw = step.get('content', '')
            if isinstance(raw, str) and 'File Path: ile:///' in raw:
                match = re.search(r'File Path: ile:///(.*?)', raw)
                if match:
                    path_match = match.group(1).replace('%20', ' ').replace('/', '\\')
                    
                    code_lines = []
                    in_code = False
                    for l in raw.split('\n'):
                        if re.match(r'^\d+: ', l):
                            in_code = True
                            code_lines.append(l.split(': ', 1)[1])
                        elif in_code and l.startswith('The above content shows the entire'):
                            in_code = False
                    
                    if code_lines:
                        # Extract just the filename to make matching easier
                        basename = os.path.basename(path_match).lower()
                        file_contents[basename] = '\n'.join(code_lines)

# Write_to_file from transcript
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        if 'write_to_file' in line:
            try:
                step = json.loads(line)
                if 'tool_calls' in step:
                    for tc in step['tool_calls']:
                        if tc.get('name') == 'write_to_file':
                            args = tc.get('args', {})
                            if 'TargetFile' in args and 'CodeContent' in args:
                                basename = os.path.basename(args['TargetFile']).lower()
                                file_contents[basename] = args['CodeContent']
            except:
                pass

print(f"Extracted {len(file_contents)} files from transcript.")
recovered = 0
target_dir = r"c:\Users\aman kesarwani201\Desktop\demo antigravity\campusgpt\backend\app"
for root, dirs, files in os.walk(target_dir):
    for f in files:
        if f.endswith('.py'):
            full_path = os.path.join(root, f)
            if os.path.getsize(full_path) == 0:
                basename = f.lower()
                if basename in file_contents:
                    with open(full_path, 'w', encoding='utf-8') as out:
                        out.write(file_contents[basename])
                    print(f"Recovered: {full_path}")
                    recovered += 1
                else:
                    print(f"Could NOT find {basename} in transcript!")

print(f"Total recovered in backend/app: {recovered}")
