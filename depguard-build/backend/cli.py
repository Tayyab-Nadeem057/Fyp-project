"""Quick command-line check (no FastAPI needed):
    python cli.py npm express expresss some-fake-pkg
    python cli.py pypi requests reqeusts
"""
import sys

from app import service


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    eco, names = sys.argv[1], sys.argv[2:]
    for r in service.analyze_many(eco, names, project="cli"):
        print(f"[{r['risk_level'].upper():10}] {r['name']}  (score {r['score']})")
        for reason in r["reasons"]:
            print(f"    - {reason['text']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
