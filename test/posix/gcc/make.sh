export LANG=C
g++ -std=c++26 -fdiagnostics-add-output=sarif:file=pass.sarif    pass.cpp    -o /dev/null
g++ -std=c++26 -fdiagnostics-add-output=sarif:file=warning.sarif warning.cpp -o /dev/null
g++ -std=c++26 -fdiagnostics-add-output=sarif:file=error.sarif   error.cpp   -o /dev/null