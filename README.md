## Blockly

Google's Blockly is a web-based, visual programming editor. Users can drag
blocks together to build programs. All code is free and open source.

**The project page is https://developers.google.com/blockly/**

You use this git repo to build the `msg` directory and the `blockly-compressed.js` for the Open-Roberta lab.

## Build the Resources for the Open-Roberta Lab

### Rebuild the core artifact locally

For core/block changes, use Python 3.12+, Java, `patch`, and the pinned local
Closure compiler JAR. This path does not install dependencies or contact an
online compiler. Install the compiler and the DOM test package once in a separate tools directory:

```bash
npm install --prefix /tmp/blockly-tools --no-audit --no-fund --ignore-scripts \
  --save-exact google-closure-compiler-java@20200719.0.0 @xmldom/xmldom@0.9.12
python3 build_core.py \
  --compiler-jar /tmp/blockly-tools/node_modules/google-closure-compiler-java/compiler.jar \
  --output /tmp/blockly_compressed.js
node tests/esp32py_core_test.js /tmp/blockly_compressed.js \
  /tmp/blockly-tools/node_modules/@xmldom/xmldom
```

The ESP32Py test takes both paths explicitly, so its DOM dependency is not a
repository or production dependency.

`build_core.py` uses the existing compiler flags and the repository's
`z-Docker/closure-library.tgz` in a temporary directory. It applies
`z-Docker/closure-library-openroberta.patch` to preserve the `addChildAt` DOM
reordering behavior already present in the Lab's upstream artifact: remove an
existing child before resolving its new DOM index. The bundled Closure source
otherwise inserts a forward-moving child at a different position. The patch
must apply without fuzz; compilation fails if the expected dependency source
or compiler version is unavailable. The script prints dependency/output hashes.

Dependency SHA-256 values used for the verified build:

- Closure archive: `c3f9a52424c1f725823db980186269500f96c5f9a7074a9c6081f72e63269384`
- Compiler JAR 20200719.0.0: `ffee421d69c5a1ddd7b3cbdfdc9ee25c63da262b0960d93a83aa29fe79d8ee28`

This builds only `blockly_compressed.js`; it uses the checked-in `msg/js`
translations. When changing messages, regenerate them with the full legacy
build below, then run `build_core.py` before copying the core artifact to Lab.
Never manually edit the compressed output. ESP32 definitions are in
`blocks/robConfigDefinitions.js`, `blocks/robSensorDefinitions.js`,
`blocks/robActions.js`, and `blocks/robSensors.js`; modifications to shared
initializers and helpers are explicitly guarded by the ESP32 device identifier.

### Full legacy build, including translations

On linux systems one possibility is

-   you have the closure-library next to this project
    (you need version [20200719.0.0](https://github.com/google/closure-library/archive/refs/tags/v20200719.zip))
    make sure to remove the version number from the folder name. buily.py requires the closure-library folder to be named `closure-library` 
-   you have installed the closure compiler via npm:
    -   e.g. `npm install --save google-closure-compiler@20200719`
    -   check the version: `npx google-closure-compiler --version` => `v20200719`
-   you have installed python 2.7 (:-<)
-   run the `build.py` script

A second solution is to install docker. Then run

```bash
GIT=:your-blockly-git-full-path:
docker run \
       --mount type=bind,source=$GIT,destination=/opt/blockly/blockly \
       -u $(id -u):$(id -g) \
       openroberta/blocklybuilder:22.04
```

You can put everything into one line, of course. The strange looking `-u` parameter is needed to give correct
ownership and permission to the files generated if docker runs as non-root.

## Workflow

-   you have cloned the blockly git https://github.com/OpenRoberta/blockly.git into `:your-blockly-git:`
-   you have a feature branch `git checkout -b feature/myChanges`
-   you edit a file in the `blocks` folder to add or change a blockly block and edit the file
    `robMsg/robMessages.js` to add or change a message and then re-build the resources. Use one of the possibilities described above.
    _Never_ change a file in the `msg` folder, because these changes are overwritten by the next build.
-   check your changes in the blockly playground found in the directory `tests`. One of the many playgrounds
    will fit your need. You may copy one and modify it. If you are satisfies with your results, continue.
-   try your results in the Open-Roberta lab: copy the `msg` directory and the `blockly-compressed.js` into
    `:your-openroberta-lab-git:/OpenrobertaServer/staticResources/blockly`. If you are satisfies with your results, continue.
-   rebase your feature branch in the blockly repo against master: `git fetch;git rebase master`
-   merge your feature branch in the blockly repo into master:
    `git checkout master;git merge feature/myChanges;git push`
-   later delete your feature branch `git branch -d feature/myChanges`
-   your changes to blockly are now persisted in the `blockly` repo **and** contained in your
    `:your-openroberta-lab-git:`. You have to commit these changes in your feature branch in the openroberta
    repo and you'll should soon merge your changes to `develop`!

Note, that the `blockly` repo only provides a `master` branch. There is no high traffic and thus it ok to simplify the repo structure.

## How to create the blocklybuilder image

```bash
cd z-docker
docker build -t openroberta/blocklybuilder:22.04 .
```

Look into the `Dockerfile` to see what is stored in the image
