#!/usr/bin/env node

import { spawn }  from "child_process";
import * as yargs from "yargs";
import * as fs from "fs";


interface TypeSignature {
    signature: string;
    name: string;
};

interface Module {
    moduleName: string;
    types: TypeSignature[];
}

function isDecoder(type: TypeSignature): boolean {
    if (type.signature.indexOf("->") > -1) return false;

    return type.signature.split(" ")[0] === "Json.Decode.Decoder";
};

function isSimpleView(type: TypeSignature): boolean {
    let pieces = type.signature.split("->");

    if (pieces.length > 2 || pieces.length < 1) return false;

    pieces = pieces.map((piece) => piece.trim());

    let finalTypeParts = pieces[pieces.length - 1].split(" ");

    if (finalTypeParts.length === 1) return false;

    if (finalTypeParts[0] != "Html.Html") return false;

    return true;
};


function onlyDecoders(module: Module): Module {
    return {
        moduleName: module.moduleName,
        types: module.types.filter(isDecoder)
    };
};

function onlySimpleViews(module: Module): Module {
    return {
        moduleName: module.moduleName,
        types: module.types.filter(isSimpleView)
    };
};

function onlyDecodersAndSimpleViews(module: Module): Module {
    return {
        moduleName: module.moduleName,
        types: module.types.filter((item) => isSimpleView(item) || isDecoder(item) )
    };
};

function imports(modules: Module[]) : string[] {
    return modules
    .map((module) => "import " + module.moduleName);
};

function fullDecoderName(module: Module, type: TypeSignature) : string {
    return module.moduleName + "." + type.name;
};

function fullSimpleViewName(module: Module, type: TypeSignature) : string {
    if (module.moduleName === "") return type.name;

    return module.moduleName + "." + type.name;
};

function viewConstructor(signature : string) : string {
    let firstPart = signature.split("->")[0];
    let withoutSpaces = firstPart.split(" ").join("").split(".").join("_");
    let constructorName = withoutSpaces + "Constructor";

    return constructorName;
};


function decoderConstructor(type : TypeSignature) : string {
    let firstPart = type.signature;
    let withoutSpaces = firstPart.split(" ").join("").split(".").join("_").split("(").join("_").split(")").join("_");
    let constructorName = withoutSpaces + "Constructor";

    return constructorName;
};


function decoderConstructorWithArg(type : TypeSignature) : string {
    let firstPart = type.signature;
    let secondPart = firstPart.substr(firstPart.indexOf(" "));
    let withoutSpaces = firstPart.split(" ").join("").split(".").join("_").split("(").join("_").split(")").join("_");
    let constructorName = withoutSpaces + "Constructor (" + secondPart + ")";

    return constructorName;
};

function decoderConstructorWithVar(type : TypeSignature) : string {
    let firstPart = type.signature;
    let secondPart = firstPart.substr(firstPart.indexOf(" "));
    let withoutSpaces = firstPart.split(" ").join("").split(".").join("_").split("(").join("_").split(")").join("_");
    let constructorName = withoutSpaces + "Constructor model";

    return constructorName;
};

function callViewWithModel(module : Module, type: TypeSignature) : string {
    return fullSimpleViewName(module, type) + " model";
};


function decoderConstructorToView(pair: ViewAndDecoderPair) : string {
    return `${decoderConstructorWithVar(pair.decoder)} -> ${callViewWithModel(pair.viewModule, pair.view)}`
};

function decoderConstructorToString(pair: ViewAndDecoderPair) : string {
    return `${decoderConstructorWithVar(pair.decoder)} -> toString model`
};

function constructorPattern(type: TypeSignature) : string {
    let firstPart = type.signature.split("->")[0];
    let withoutSpaces = firstPart.split(" ").join("");
    let patternName = withoutSpaces + "Constructor -> " + type.name;

    return patternName;
};

interface ViewAndDecoderPair {
    decoder : TypeSignature,
    view : TypeSignature,
    decoderModule : Module,
    viewModule: Module
};

function isAPair(decoder: TypeSignature, view: TypeSignature) : boolean {
    let decoderType = decoder.signature.substr(decoder.signature.indexOf(" ")).trim();
    let viewType = view.signature.split(" -> ")[0].trim();

    return viewType === decoderType;
}

function viewAndDecoderPairs(modules: Module[]) : ViewAndDecoderPair[] {
    const pairs : ViewAndDecoderPair[] = [];

    modules.forEach((outerModule) => {
        onlyDecoders(outerModule).types.forEach((decoder) => {
            let foundAPair = false;

            modules.every((innerModule) => {
                onlySimpleViews(innerModule).types.every((view) => {
                    if (isAPair(decoder, view)) {
                        pairs.push({
                            decoder: decoder,
                            view: view,
                            viewModule: innerModule,
                            decoderModule: outerModule
                        });

                        foundAPair = true;
                        return false;
                    }

                    return true;
                });

                if (foundAPair) return false;

                return true;
            });

            if (!foundAPair) {
                pairs.push({
                    decoder: decoder,
                    view: { name: "Html.text <| toString", signature: "KnownDecoders -> Html.Html msg" },
                    viewModule : { moduleName: "", types: []},
                    decoderModule : outerModule
                });
            }
        });
    });


    return pairs;
};



function elmFile (modules: Module[]) : string {
    const importLines = imports(modules);
    const onlyDecodersModules = modules.map(onlyDecoders);
    const onlySimpleViewsModules = modules.map(onlySimpleViews);

    const allDecoderNames : string[] = [];
    const allDecoders : TypeSignature[] = [];
    const decoderConstructors : string[] = [];
    const moduleTuples : string[] = [];

    onlyDecodersModules.forEach((module) => {
        module.types.forEach((type) =>{
            const fullName = fullDecoderName(module, type);
            allDecoderNames.push(fullName);
            allDecoders.push(type);


            moduleTuples.push(`(\"${fullName}\", Json.Decode.map (${decoderConstructor(type)}) ${fullName})`);

            decoderConstructors.push(decoderConstructorWithArg(type));
        })
    });

    if (decoderConstructors.length === 0) { decoderConstructors.push( "NULL")}

    const allSimpleViewNames : string[] = [];

    onlySimpleViewsModules.forEach((module) => {
        module.types.forEach((type) =>{
            allSimpleViewNames.push(fullSimpleViewName(module, type));
        })
    });

    const pairs = viewAndDecoderPairs(modules);

    let viewCases = pairs.map(decoderConstructorToView);
    viewCases = viewCases.filter((v, i, a) => a.indexOf(v) === i);

    let resultCases = pairs.map(decoderConstructorToString);
    resultCases = resultCases.filter((v, i, a) => a.indexOf(v) === i);

    const viewConstructors = allSimpleViewNames.map((viewName) => {
        return viewConstructor(viewName);
    });

    if (viewConstructors.length === 0) { viewConstructors.push( "NULL")}

    return  `

module DebugDecoders exposing (main)

import Html
import Html.Attributes
import Html.Events
import Dict
import Json.Decode
import Json.Encode

${importLines.join("\n")}

decodersByName : Dict.Dict String (Json.Decode.Decoder KnownDecoders)
decodersByName =
    Dict.fromList
        [ ${moduleTuples.join("\n        , ")}
        ]

type Msg
    = ChangeJson String
    | SaveChange
    | SetCurrentResult (Maybe String)


type KnownDecoders
    = ${decoderConstructors.join("\n    | ")}

type KnownViews
    = ${viewConstructors.join("\n    | ")}


viewAResult : KnownDecoders -> Html.Html msg
viewAResult decoder =
    case decoder of
        ${viewCases.join("\n        ")}


resultToEnglish : KnownDecoders -> String
resultToEnglish decoder =
    case decoder of
        ${resultCases.join("\n        ")}


type alias Model =
    { json : String
    , tempJson : String
    , knownDecoders : Dict.Dict String (Json.Decode.Decoder KnownDecoders)
    , visibleResult : Maybe String
    }


viewHowManyRan : Model -> Int -> Html.Html Msg
viewHowManyRan model amount =
    Html.div []
        [ "I ran "
            ++ (toString <| Dict.size model.knownDecoders)
            ++ " decoders! "
            ++ (toString amount) ++ " passed successfully."
            |> Html.text
        ]


runDecoder : Json.Decode.Decoder KnownDecoders -> String -> Result String KnownDecoders
runDecoder =
    Json.Decode.decodeString

viewSimpleResult : Bool -> String -> Result String KnownDecoders -> Html.Html Msg
viewSimpleResult opened decoderName result =
    let
        color =
            case result of
                Err _ ->
                    "red"

                Ok _ ->
                    "green"
        caret =
            if opened then
                downCaret
            else
                rightCaret

        newCurrentlyOpened =
            if opened then
                Nothing
            else
                Just decoderName
    in
        Html.li
            [ Html.Events.onClick (SetCurrentResult newCurrentlyOpened)
            , Html.Attributes.style [ ("margin", "5px 0") ]
            ]
            [ Html.div [ Html.Attributes.style [ ("display", "flex"), ("flex-direction","row"), ("align-items", "center") ] ]
                [ Html.span [ Html.Attributes.style [ ("padding", "0 5px") ] ]
                    [ caret color
                    ]
                , Html.span [] [ Html.text decoderName ]
                ]
            , if opened then
                Html.div []
                    [ case result of
                        Err resultText ->
                            styledPre resultText

                        Ok resultText ->
                            styledPre (resultToEnglish resultText)
                    ]
              else
                Html.text ""
            ]

styledPre : String -> Html.Html msg
styledPre value =
    Html.pre
        [ Html.Attributes.style
            [ ("border", "1px solid #ccc")
            , ("border-radius", "4px")
            , ("background-color", "#f5f5f5")
            , ("padding", "10px")
            , ("color", "#333")
            , ("width", "100%")
            , ("white-space","normal")
            ]
        ]
        [ Html.text value ]

rightCaret : String -> Html.Html msg
rightCaret color =
    Html.div
        [ Html.Attributes.style
            [ ( "width", "0" )
            , ( "height", "0" )
            , ( "border-top", "10px solid transparent" )
            , ( "border-bottom", "10px solid transparent" )
            , ( "border-left", "20px solid " ++ color)
            , ("padding", "0px 10px 0px 5px")
            , ("margin", "5px 0 5px 0")
            ]
        ]
        []

downCaret : String -> Html.Html msg
downCaret color =
    Html.div
        [ Html.Attributes.style
            [ ( "width", "0" )
            , ( "height", "0" )
            , ( "border-left", "10px solid transparent" )
            , ( "border-right", "10px solid transparent" )
            , ( "border-top", "20px solid " ++ color)
            , ("margin", "5px 15px 5px 0")
            ]
        ]
        []

viewInputJson : Model -> Html.Html Msg
viewInputJson model =
    Html.div
        []
        [ Html.textarea
            [ Html.Attributes.style [ ( "width", "100%" ), ( "height", "500px" ) ]
            , Html.Events.onInput ChangeJson
            , Html.Attributes.value model.tempJson
            ]
            []
        , Html.div [] [ formButton SaveChange "Test" ]
        ]

formButton : msg -> String -> Html.Html msg
formButton action text =
    Html.button
        [ Html.Events.onClick action
        , Html.Attributes.style
            [ ("font-size", "24px")
            , ( "width", "100%")
            , ("border-style", "none")
            , ("border-radius", "4px")
            , ("background-color", "#07c")
            , ("color", "white")
            , ("margin", "5px")
            ]
        ]
        [ Html.text text ]

view : Model -> Html.Html Msg
view model =
    let
        decoderResults =
            Dict.toList model.knownDecoders
                |> List.map (\\( name, decoder ) -> (name, runDecoder decoder model.json))

        sortedBySuccess =
            decoderResults
                |> List.sortBy (\\(name, result) ->
                    case result of
                        Err e ->
                            1000
                        Ok _ ->
                            0
                    )

        isOk res =
            case res of
                Ok _ -> True
                _ -> False

        viewResults =
            List.map (\\(name, result) -> viewSimpleResult (model.visibleResult == Just name) name result) sortedBySuccess

        successfulRuns =
            List.filter (\\(_, result) -> isOk result) decoderResults
                |> List.length

        columnStyle =
            Html.Attributes.style [("width", "410px"), ("padding", "0 20px") ]
    in
        Html.div
            [ Html.Attributes.style [( "display", "flex"), ("flex-direction", "column"), ( "align-items", "center")]]
            [ Html.h1 [] [ Html.text "elm-debug-decoders" ]
            , Html.div
                [ Html.Attributes.style [ ("display", "flex"), ("flex-direction", "row"), ("width", "900px")]]
                [ Html.div [ columnStyle ]
                    [viewInputJson model]
                , Html.div [ columnStyle ]
                    [ viewHowManyRan model successfulRuns
                    , Html.ul [ Html.Attributes.style [ ("list-style", "none"), ("padding-left", "0") ]]
                        (viewResults)
                    ]
                ]
            ]


update : Msg -> Model -> ( Model, Cmd msg )
update msg model =
    case msg of
        SaveChange ->
            ( { model | json = model.tempJson }, Cmd.none )

        ChangeJson newJson ->
            ( { model | tempJson = newJson }, Cmd.none )

        SetCurrentResult result ->
            ( { model | visibleResult = result }, Cmd.none )


main = Html.program
    { init = ({ json = "", tempJson = "", knownDecoders = decodersByName, visibleResult = Nothing }, Cmd.none)
    , update=  update
    , view = view
    , subscriptions = (\\_ -> Sub.none)
    }
`;
}

function main(){

    const foundArgs = yargs
        .alias("path", "p")
        .describe("path", "A path where your elm-package.json exists")
        .default("path", process.cwd())
        .usage("Provide me with a path to your elm-package.json folder. I'll find all your decoders! Then just open the file I create in elm-reactor")
        .help()
        .alias("h", "help")
        .argv;


    const path = foundArgs.path;
    let hadError = false;

    try{
        fs.readFileSync(path + "/elm-package.json");
    } catch(e){
        console.log("elm-package.json did not exist at ", path);
        console.log("Please give me the path where your elm-package.json is!");
        process.exit(1);
    }

    let stuff = spawn("elm-interface-to-json", ["--path", path]);
    let readData = "";

    stuff.on('error', (error) => {
        console.log("Error! Unable to start elm-interface-to-json");
        console.log("Make sure to install elm-interface-to-json globally first..");
        console.log("npm install -g elm-interface-to-json");
        process.exit(1);
    });

    stuff.stdout.on('data', (data) => {
        readData += data;
    });

    stuff.stderr.on('data', (data) => {
        if (!hadError) {
            console.log("Failed to load data using elm-interface-to-json correctly...");
            console.log("Did you run elm-make in the directory already? If not, do so now!");
        }

        hadError = true;
    });

    stuff.on('close', (code) => {
        if (hadError) {
            console.log("Something went wrong while running elm-interface-to-json...");
            console.log("It exited with the code:", code);
            process.exit(code);
        }
        const parsedData = JSON.parse(readData) as Module[];

        const modulesWithOnlyDecodersOrViews = parsedData
            .filter((module) => (module.moduleName != "DebugDecoders"))
            .map(onlyDecodersAndSimpleViews)
            .filter((module) => module.types.length > 0);

        console.log('Creating a file at', path + "/DebugDecoders.elm");
        fs.writeFileSync(path + "/DebugDecoders.elm", elmFile(modulesWithOnlyDecodersOrViews));
        console.log("Open it with elm-reactor!");
    });

};
main();
