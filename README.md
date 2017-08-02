# elm-debug-decoders
A tool for debugging decoders in Elm. This tool allows you to easily tell which decoders passed on the data you give it via a web UI.

## Install

This package requires `elm-interface-to-json` to be installed globally. 

```
npm install -g elm-interface-to-json
npm install -g elm-debug-decoders
```


## Usage

This tool will generate an Elm file inside the directory you specifiy. It will use your `elm-package.json` in order to look up which decoders to pull things in from. 

```
# Load the decoders in the example dir's elm-package.json
elm-debug-decoders --path example/

# Load the ones in the current directory
elm-debug-decoders 
```

You then need to open the `DebugDecoders.elm` file inside elm-reactor, and paste your JSON into the text field!



