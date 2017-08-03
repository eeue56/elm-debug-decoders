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
    let withoutSpaces = firstPart.split(" ").join("").split(".").join("_");
    let constructorName = withoutSpaces + "Constructor";

    return constructorName;
};


function decoderConstructorWithArg(type : TypeSignature) : string {
    let firstPart = type.signature;
    let secondPart = firstPart.split(" ")[1];
    let withoutSpaces = firstPart.split(" ").join("").split(".").join("_");
    let constructorName = withoutSpaces + "Constructor (" + secondPart + ")";

    return constructorName;
};

function decoderConstructorWithVar(type : TypeSignature) : string {
    let firstPart = type.signature;
    let secondPart = firstPart.split(" ")[1];
    let withoutSpaces = firstPart.split(" ").join("").split(".").join("_");
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
        modules.forEach((innerModule) => {

            onlyDecoders(outerModule).types.forEach((decoder) => {

                const foundAPair = onlySimpleViews(innerModule).types.every((view) => {
                    if (isAPair(decoder, view)) {
                        pairs.push({
                            decoder: decoder,
                            view: view,
                            viewModule: innerModule,
                            decoderModule: outerModule
                        });

                        return false;
                    }

                    return true;
                });

                if (foundAPair) {
                    pairs.push({
                        decoder: decoder, 
                        view: { name: "Html.text <| toString", signature: "KnownDecoders -> Html.Html msg" },
                        viewModule : { moduleName: "", types: []},
                        decoderModule : outerModule
                    });
                }
            });
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

    const viewCases = pairs.map(decoderConstructorToView);
    const resultCases = pairs.map(decoderConstructorToString);


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

${importLines.join("\n")}

decodersByName : Dict.Dict String (Json.Decode.Decoder KnownDecoders)
decodersByName = 
    Dict.fromList 
        [ ${moduleTuples.join("\n        , ")}
        ]

type Msg
    = ChangeJson String
    | SaveChange
    | SetCurrentResult String


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
    "I ran "
        ++ (toString <| Dict.size model.knownDecoders)
        ++ " decoders!"
        ++ (toString amount) ++ " passed successfully."
        |> Html.text


runDecoder : Json.Decode.Decoder KnownDecoders -> String -> Result String KnownDecoders 
runDecoder = 
    Json.Decode.decodeString

viewSimpleResult : String -> Result String KnownDecoders -> Html.Html Msg
viewSimpleResult decoderName result =
    let
        color =
            case result of
                Err _ ->
                    "red"

                Ok _ ->
                    "green"
    in
        Html.div
            [ Html.Events.onClick (SetCurrentResult decoderName) ]
            [ Html.text decoderName
            , Html.div
                [ Html.Attributes.style [ ( "width", "50px" ), ( "height", "50px" ), ( "background-color", color ) ] ]
                []
            ]




viewInputJson : Model -> Html.Html Msg
viewInputJson model =
    Html.div
        []
        [ Html.textarea
            [ Html.Attributes.style [ ( "width", "500px" ), ( "height", "500px" ) ]
            , Html.Events.onInput ChangeJson
            , Html.Attributes.value model.tempJson
            ]
            []
        , Html.button [ Html.Events.onClick SaveChange ] [ Html.text "Test" ]
        ]


viewSuccessfulThing : Model -> Html.Html msg 
viewSuccessfulThing model = 
    case model.visibleResult of 
        Nothing -> Html.text ""

        Just result ->
            case Dict.get result model.knownDecoders of 
                Just foundDecoder ->
                    let    
                        runResult = runDecoder foundDecoder model.json
                    in 
                        Html.div 
                            []
                            [ Html.span [ ] [ Html.text <| "The decoder known as " ++ result ++ " produced the following value: " ]
                            , Html.p [ ] [ 
                                case runResult of 
                                    Ok v -> Html.div [] [ Html.text (resultToEnglish v) ]
                                    Err e -> Html.text e
                                ]
                            , Html.span [] [ Html.text <| "And I found this view: " ]
                            , Html.div [] [
                                case runResult of
                                    Ok v -> viewAResult v 
                                    Err _ -> Html.text ""
                                ]

                            ] 

                Nothing ->
                    Html.text ""
            


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
            List.map (\\(name, result) -> viewSimpleResult name result) sortedBySuccess

        successfulRuns = 
            List.filter (\\(_, result) -> isOk result) decoderResults
                |> List.length

    in
        Html.div
            []
            [ Html.div [] (viewInputJson model :: viewHowManyRan model successfulRuns :: viewSuccessfulThing model :: [] ) 
            , Html.div [] (viewResults)
            ]


update : Msg -> Model -> ( Model, Cmd msg )
update msg model =
    case msg of
        SaveChange ->
            ( { model | json = model.tempJson }, Cmd.none )

        ChangeJson newJson ->
            ( { model | tempJson = newJson, visibleResult = Nothing }, Cmd.none )

        SetCurrentResult result ->
            ( { model | visibleResult = Just result }, Cmd.none )


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