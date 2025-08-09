import sys, json

def main():
    # Stub worker — echoes input
    line = sys.stdin.readline()
    call = json.loads(line)
    print(json.dumps({"echo": call}))

if __name__ == '__main__':
    main()